import puppeteer from 'puppeteer';
import fs from 'fs';

console.log('Launching Puppeteer...');
const browser = await puppeteer.launch({
    headless: true, // Ensures headless mode
    args: ['--no-sandbox', '--disable-setuid-sandbox'] // Prevent permission issues in CI/CD
});
const page = (await browser.pages())[0];

const feedURL = 'https://www.ubereats.com/feed?diningMode=PICKUP&pl=JTdCJTIyYWRkcmVzcyUyMiUzQSUyMjQ3OCUyMFJpbW9zYSUyMENydCUyMiUyQyUyMnJlZmVyZW5jZSUyMiUzQSUyMmU2NTExNTk5LWYxMWEtY2Q3MC0xZTViLTFmNjA1Njg2YjdkNCUyMiUyQyUyMnJlZmVyZW5jZVR5cGUlMjIlM0ElMjJ1YmVyX3BsYWNlcyUyMiUyQyUyMmxhdGl0dWRlJTIyJTNBNDMuOTAyMzM0JTJDJTIybG9uZ2l0dWRlJTIyJTNBLTc4LjkwMzM2MyU3RA';

console.log(`Scraping from: ${feedURL}`);
await page.goto(feedURL, { waitUntil: 'networkidle2', timeout: 60000 }); // Increased timeout

const cards = 'div:has(> div > div > div > a[data-testid="store-card"])';
await page.waitForSelector(cards, { timeout: 30000 }); // Wait for cards to load

const restaurants = [];
for (const el of await page.$$(cards)) {
    const offer = await el.evaluate(e => e.querySelector('picture + div > div')?.textContent) || '';
    console.log(`Found Offer: ${offer}`);

    if (offer.includes('Get 1 Free') || offer.includes('Offers')) {
        const url = await el.evaluate(e => e.querySelector('a').href);
        console.log(`Adding restaurant: ${url}`);
        restaurants.push(url);
    }
}

console.log(`${restaurants.length} restaurants found!`);
await browser.close();

const allCompiled = [];
for (let i = 0; i < restaurants.length; i++) {
    const url = restaurants[i];

    console.log(`(${i + 1}/${restaurants.length}) Fetching ${url} with Puppeteer...`);

    try {
        const browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 }); // Increased timeout

        // Save HTML for debugging
        const body = await page.content();
        fs.writeFileSync(`./debug-${i + 1}.html`, body);
        console.log(`Saved debug file: debug-${i + 1}.html`);

        // Extract React state
        const reactDataMatch = body.match(/__REACT_QUERY_STATE__">(.*?)<\/script>/s);
        if (!reactDataMatch) {
            console.log(`⚠️ No REACT_QUERY_STATE found for ${url}`);
            continue;
        }

        const rawData = JSON.parse(decodeURIComponent(JSON.parse(`"${reactDataMatch[1].trim()}"`)));
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

            const deals = [];
            for (const item of items.values()) {
                if (item.itemPromotion) deals.push(item);
            }

            if (deals.length) {
                const compiled = JSON.parse(data.metaJson);
                compiled.deals = deals;
                delete compiled.hasMenu;
                allCompiled.push(compiled);
                console.log(`✅ Got data for ${compiled.name}: ${deals.length} deal(s) found`);
            } else {
                console.log(`❌ No deals found for ${url}`);
            }
        } else {
            console.log(`❌ No valid data found for ${url}`);
        }

        await browser.close();
    } catch (error) {
        console.error(`Error scraping ${url}: ${error.message}`);
    }

    console.log('Sleeping 3 seconds...');
    await new Promise(r => setTimeout(r, 3000));
}

console.log('Compiled data to be written:', allCompiled);
fs.writeFileSync('./scraped.json', JSON.stringify(allCompiled));
