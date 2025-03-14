import puppeteer from 'puppeteer';
import fetch from 'node-fetch';
import fs from 'fs';

console.log('launching puppeteer...');
//const browser = await puppeteer.launch({ headless: 'new' });
const browser = await puppeteer.launch({
	headless: true, // Make sure it's headless mode
	args: ['--no-sandbox', '--disable-setuid-sandbox'] // Disable sandboxing
  });
const page = (await browser.pages())[0];

const feedURL = 'https://www.ubereats.com/feed?diningMode=PICKUP&pl=JTdCJTIyYWRkcmVzcyUyMiUzQSUyMjQ3OCUyMFJpbW9zYSUyMENydCUyMiUyQyUyMnJlZmVyZW5jZSUyMiUzQSUyMmU2NTExNTk5LWYxMWEtY2Q3MC0xZTViLTFmNjA1Njg2YjdkNCUyMiUyQyUyMnJlZmVyZW5jZVR5cGUlMjIlM0ElMjJ1YmVyX3BsYWNlcyUyMiUyQyUyMmxhdGl0dWRlJTIyJTNBNDMuOTAyMzM0JTJDJTIybG9uZ2l0dWRlJTIyJTNBLTc4LjkwMzM2MyU3RA';

console.log(`Scraping from: ${feedURL}`);

await page.goto(feedURL, { waitUntil: 'networkidle2' });

const cards = 'div:has(> div > div > div > a[data-testid="store-card"])';
await page.waitForSelector(cards);

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
/*console.log('getting nearby restaurants..');
await page.goto(feedURL);

const cards = 'div:has(> div > div > div > a[data-testid="store-card"])';
await page.waitForSelector(cards);

const restaurants = [];
for (const el of await page.$$(cards)) {
	const offer = await el.evaluate(e => e.querySelector('picture + div > div')?.textContent) || '';
	if (offer.includes('Get 1 Free') || offer.includes('Offers')) {
		restaurants.push(await el.evaluate(e => e.querySelector('a').href));
	}
}

console.log(`${restaurants.length} potential restaurants with offers found! closing puppeteer...`);*/
await browser.close();

const allCompiled = [];
for (let i = 0; i < restaurants.length; i++) {
	const url = restaurants[i];

console.log(`(${i+1}/${restaurants.length}) Fetching ${url}...`);

try {
    const response = await fetch(url, {
        headers: { 'user-agent': 'Mozilla/5.0' }
    });

    const body = await response.text();
    console.log(`Response length for ${url}: ${body.length}`);

    if (body.length < 1000) {
        console.log(`⚠️ Warning: Small response, might be blocked or different content!`);
    }

    fs.writeFileSync(`./debug-${i + 1}.html`, body);
} catch (error) {
    console.error(`Error fetching ${url}:`, error.message);
}


	/*try {
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
				// Add a check here to make sure `payload.standardItemsPayload` and `payload.standardItemsPayload.catalogItems` exist
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
				console.log(`got data for ${compiled.name}: ${deals.length} deal(s) found`);
			} else {
				console.log(`no deals found for this restaurant1`);
			}
		} else {
			console.log(`no deals found for this restaurant2`);
		}
	} catch (error) {
		console.error(`Error scraping ${url}: ${error.message}`);
	}*/

	console.log('sleeping 3 seconds...');
	await new Promise(r => setTimeout(r, 3000));
}

console.log('Compiled data to be written:', allCompiled);
fs.writeFileSync('./scraped.json', JSON.stringify(allCompiled));
