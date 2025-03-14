import puppeteer from 'puppeteer';
import fetch from 'node-fetch';
import fs from 'fs';

console.log('launching puppeteer...');
//const browser = await puppeteer.launch({ headless: 'new' });
const browser = await puppeteer.launch({
	headless: 'new', // Make sure it's headless mode
	args: [ '--no-sandbox',
    '--disable-setuid-sandbox',
    '--proxy-server=http://3.97.176.251:3128']
  });
const page = (await browser.pages())[0];
const feedURL = 'https://www.ubereats.com/feed?diningMode=PICKUP&pl=JTdCJTIyYWRkcmVzcyUyMiUzQSUyMjQ3OCUyMFJpbW9zYSUyMENydCUyMiUyQyUyMnJlZmVyZW5jZSUyMiUzQSUyMmU2NTExNTk5LWYxMWEtY2Q3MC0xZTViLTFmNjA1Njg2YjdkNCUyMiUyQyUyMnJlZmVyZW5jZVR5cGUlMjIlM0ElMjJ1YmVyX3BsYWNlcyUyMiUyQyUyMmxhdGl0dWRlJTIyJTNBNDMuOTAyMzM0JTJDJTIybG9uZ2l0dWRlJTIyJTNBLTc4LjkwMzM2MyU3RA';

console.log('getting nearby restaurants..');
 await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
   
await page.setGeolocation({"latitude":43.902334,"longitude":-78.903363});
await page.emulateTimezone('America/Toronto');
await page.goto(feedURL, { waitUntil: 'networkidle2' });

const cards = 'div:has(> div > div > div > a[data-testid="store-card"])';
await page.waitForSelector(cards);

const restaurants = [];
for (const el of await page.$$(cards)) {
	const offer = await el.evaluate(e => e.querySelector('picture + div > div')?.textContent) || '';
	if (offer.includes('Get 1 Free') || offer.includes('Offers')) {
		restaurants.push(await el.evaluate(e => e.querySelector('a').href));
	}
}

console.log(`${restaurants.length} potential restaurants with offers found! closing puppeteer...`);
await browser.close();

const allCompiled = [];
for (let i = 0; i < restaurants.length; i++) {
	const url = restaurants[i];

	console.log(`(${i+1}/${restaurants.length}) fetching ${url}...`);

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
				// Add a check here to make sure `payload.standardItemsPayload` and `payload.standardItemsPayload.catalogItems` exist
				if (payload.standardItemsPayload?.catalogItems) {
					for (const item of payload.standardItemsPayload.catalogItems) {
						items.set(item.uuid, item);
					}
				} else {
					console.log(`No catalog items found for ${url}`);
				}
			}

			//console.log("Item structure:", JSON.stringify([...items.values()], null, 2));

			const deals = [];
			for (const item of items.values()) {
				console.log("Item structure:", JSON.stringify(item, null, 2));
				if (item.itemPromotion) deals.push(item);
			}
			console.log(deals)

			if (deals.length) {
				const compiled = JSON.parse(data.metaJson);
				compiled.deals = deals;
				delete compiled.hasMenu;

				allCompiled.push(compiled);
				//console.log(`got data for ${compiled.name}: ${deals.length} deal(s) found`);
			} else {
				console.log(`no deals found for this restaurant`);
			}
		} else {
			console.log(`no deals found for this restaurant`);
		}
	} catch (error) {
		console.error(`Error scraping ${url}: ${error.message}`);
	}

	console.log('sleeping 3 seconds...');
	await new Promise(r => setTimeout(r, 3000));
}

console.log('Compiled data to be written:', allCompiled);
fs.writeFileSync('./scraped.json', JSON.stringify(allCompiled));
