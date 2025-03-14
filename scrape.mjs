import puppeteer from 'puppeteer';
import fetch from 'node-fetch';
import fs from 'fs';

console.log('Launching Puppeteer...');
const browser = await puppeteer.launch({ headless: false });
const page = (await browser.pages())[0];

const feedURL = 'https://www.ubereats.com/feed?diningMode=PICKUP&pl=JTdCJTIyYWRkcmVzcyUyMiUzQSUyMjQ3OCUyMFJpbW9zYSUyMENydCUyMiUyQyUyMnJlZmVyZW5jZSUyMiUzQSUyMmU2NTExNTk5LWYxMWEtY2Q3MC0xZTViLTFmNjA1Njg2YjdkNCUyMiUyQyUyMnJlZmVyZW5jZVR5cGUlMjIlM0ElMjJ1YmVyX3BsYWNlcyUyMiUyQyUyMmxhdGl0dWRlJTIyJTNBNDMuOTAyMzM0JTJDJTIybG9uZ2l0dWRlJTIyJTNBLTc4LjkwMzM2MyU3RA';

console.log('Getting nearby restaurants...');
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

console.log(`${restaurants.length} potential restaurants with offers found! Closing Puppeteer...`);
await browser.close();

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

		// Log raw data for debugging
		console.log(`Raw Data for ${url}:`, JSON.stringify(data, null, 2));

		if (data && section && section.isOnSale && data.catalogSectionsMap[section.uuid]) {
			const items = new Map();
			for (const { payload } of data.catalogSectionsMap[section.uuid]) {
				if (payload.standardItemsPayload?.catalogItems) {
					for (const item of payload.standardItemsPayload.catalogItems) {
						items.set(item.uuid, item);
					}
				}
			}

			// Log the items found
			console.log(`Items found for ${url}:`, JSON.stringify([...items.values()], null, 2));

			const deals = [];
			for (const item of items.values()) {
				if (item.itemPromotion) {
					deals.push(item);
				}
			}

			// If deals are found, log and compile the data
			if (deals.length) {
				const compiled = JSON.parse(data.metaJson);
				compiled.deals = deals;
				delete compiled.hasMenu;

				allCompiled.push(compiled);
				console.log(`Got data for ${compiled.name}: ${deals.length} deal(s) found`);
			} else {
				console.log(`No deals found for this restaurant`);
			}
		} else {
			console.log(`No deals found for this restaurant`);
		}
	} catch (error) {
		console.error(`Error scraping ${url}: ${error.message}`);
	}

	console.log('Sleeping 3 seconds...');
	await new Promise(r => setTimeout(r, 3000));
}

console.log('Compiled data to be written:', allCompiled);

// Write compiled data to file
fs.writeFileSync('./scraped.json', JSON.stringify(allCompiled));
