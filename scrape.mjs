import puppeteer from 'puppeteer';
import fetch from 'node-fetch';
import fs from 'fs';

console.log('Launching Puppeteer...');

// Log IP address for debugging (Check if GitHub Actions IP is blocked)
async function logIP() {
    try {
        const res = await fetch('https://api64.ipify.org?format=json');
        const { ip } = await res.json();
        console.log(`Current IP: ${ip}`);
    } catch (error) {
        console.error('Error fetching IP:', error);
    }
}
await logIP();

// Set up Puppeteer
const browser = await puppeteer.launch({
    headless: true, // Running in headless mode
    args: [
       "--no-sandbox", 
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-extensions"
    ]
});
const page = (await browser.pages())[0];

// Wait for all JavaScript to execute before scraping
await page.goto('https://www.ubereats.com/', { waitUntil: 'networkidle2' });

const feedURL = 'https://www.ubereats.com/feed?diningMode=PICKUP&pl=JTdCJTIyYWRkcmVzcyUyMiUzQSUyMjQ3OCUyMFJpbW9zYSUyMENydCUyMiUyQyUyMnJlZmVyZW5jZSUyMiUzQSUyMmU2NTExNTk5LWYxMWEtY2Q3MC0xZTViLTFmNjA1Njg2YjdkNCUyMiUyQyUyMnJlZmVyZW5jZVR5cGUlMjIlM0ElMjJ1YmVyX3BsYWNlcyUyMiUyQyUyMmxhdGl0dWRlJTIyJTNBNDMuOTAyMzM0JTJDJTIybG9uZ2l0dWRlJTIyJTNBLTc4LjkwMzM2MyU3RA';

console.log('Getting nearby restaurants...');
await page.goto(feedURL, { waitUntil: 'domcontentloaded' });

const cards = 'div:has(> div > div > div > a[data-testid="store-card"])';
await page.waitForSelector(cards);

const restaurants = [];
for (const el of await page.$$(cards)) {
    const offer = await el.evaluate(e => e.querySelector('picture + div > div')?.textContent) || '';
    if (offer.includes('Get 1 Free') || offer.includes('Offers')) {
        restaurants.push(await el.evaluate(e => e.querySelector('a').href));
    }
}

console.log(`${restaurants.length} potential restaurants with offers found! Closing Puppeteer...`);
await browser.close();

// Function to add random delay (prevents rate limiting)
function delay(time) {
    return new Promise(resolve => setTimeout(resolve, time));
}

const allCompiled = [];
for (let i = 0; i < restaurants.length; i++) {
    const url = restaurants[i];
    console.log(`(${i + 1}/${restaurants.length}) Fetching ${url}...`);
    
    try {
        const body = await fetch(url, {
            headers: {
                'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            },
        }).then(res => res.text());
        
        const reactData = body.match(/__REACT_QUERY_STATE__">(.*?)<\/script>/s)?.[1];
        const rawData = reactData && JSON.parse(decodeURIComponent(JSON.parse(`"${reactData.trim()}"`)));
        const data = rawData?.queries?.[0]?.state?.data;
        const section = data?.sections?.[0];

        if (data && section && section.isOnSale && data.catalogSectionsMap[section.uuid]) {
            const items = new Map();
            for (const { payload } of data.catalogSectionsMap[section.uuid]) {
                if (payload.standardItemsPayload?.catalogItems) {
                    for (const item of payload.standardItemsPayload.catalogItems) {
                        items.set(item.uuid, item);
                    }
                } else {
                    console.log(`No catalog items found for ${url}`);
                }
            }

            console.log("Item structure:", JSON.stringify([...items.values()], null, 2));

            const deals = [];
            for (const item of items.values()) {
                if (item.itemPromotion) deals.push(item);
            }

            if (deals.length) {
                const compiled = JSON.parse(data.metaJson);
                compiled.deals = deals;
                delete compiled.hasMenu;

                allCompiled.push(compiled);
            } else {
                console.log(`No deals found for this restaurant`);
            }
        } else {
            console.log(`No deals found for this restaurant`);
        }
    } catch (error) {
        console.error(`Error scraping ${url}: ${error.message}`);
    }

    console.log('Sleeping for a random interval...');
    await delay(3000 + Math.floor(Math.random() * 2000));
}

console.log('Compiled data to be written:', allCompiled);
fs.writeFileSync('./scraped.json', JSON.stringify(allCompiled, null, 2));
console.log('Data successfully written to scraped.json');
