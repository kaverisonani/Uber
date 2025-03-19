import { Builder, By, until } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';
import fs from 'fs';
import path from 'path';
import { rmSync } from 'fs';

// Create a unique user data directory with a timestamp and random value
const uniqueUserDataDir = path.join('/tmp', `selenium-user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);

if (fs.existsSync(uniqueUserDataDir)) {
  rmSync(uniqueUserDataDir, { recursive: true, force: true }); // Clean the directory if it exists
}

fs.mkdirSync(uniqueUserDataDir, { recursive: true }); // Create a new directory

console.log(`Launching Selenium with user data dir: ${uniqueUserDataDir}`);

const options = new chrome.Options();
options.addArguments('--no-sandbox', '--disable-dev-shm-usage');
options.addArguments(`--user-data-dir=${uniqueUserDataDir}`); // Use the unique directory

// Wrap the logic inside an async function and call it
(async function() {
  try {
    const driver = await new Builder()
      .forBrowser('chrome')
      .setChromeOptions(options)
      .build();

    const feedURL = 'https://www.ubereats.com/feed?diningMode=PICKUP&pl=JTdCJTIyYWRkcmVzcyUyMiUzQSUyMjQ3OCUyMFJpbW9zYSUyMENydCUyMiUyQyUyMnJlZmVyZW5jZSUyMiUzQSUyMmU2NTExNTk5LWYxMWEtY2Q3MC0xZTViLTFmNjA1Njg2YjdkNCUyMiUyQyUyMnJlZmVyZW5jZVR5cGUlMjIlM0ElMjJ1YmVyX3BsYWNlcyUyMiUyQyUyMmxhdGl0dWRlJTIyJTNBNDMuOTAyMzM0JTJDJTIybG9uZ2l0dWRlJTIyJTNBLTc4LjkwMzM2MyU3RA';

    console.log('Getting nearby restaurants...');
    await driver.get(feedURL);

    // Wait for restaurant cards to load
    const cardSelector = 'div:has(> div > div > div > a[data-testid="store-card"])';
    await driver.wait(until.elementLocated(By.css(cardSelector)), 10000);

    // Find restaurant elements
    let restaurantElements = await driver.findElements(By.css(cardSelector));

    let restaurants = [];
    for (let el of restaurantElements) {
      let offerText = await el.findElement(By.css('picture + div > div')).getText();
      let restaurantURL = await el.findElement(By.css('a')).getAttribute('href');

      if (offerText.includes('Get 1 Free') || offerText.includes('Offers')) {
        restaurants.push(restaurantURL);
      }
    }

    console.log(`${restaurants.length} potential restaurants with offers found! Closing Selenium...`);
    await driver.quit();

    let allCompiled = [];
    for (let i = 0; i < restaurants.length; i++) {
      const url = restaurants[i];

      console.log(`(${i+1}/${restaurants.length}) Fetching ${url}...`);

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
            console.log(`No deals found for this restaurant.`);
          }
        } else {
          console.log(`No deals found for this restaurant.`);
        }
      } catch (error) {
        console.error(`Error scraping ${url}: ${error.message}`);
      }

      console.log('Sleeping 3 seconds...');
      await new Promise(r => setTimeout(r, 3000));
    }

    console.log('Compiled data to be written:', allCompiled);
    fs.writeFileSync('./scraped.json', JSON.stringify(allCompiled));

  } catch (err) {
    console.error('Error:', err);
  }
})();
