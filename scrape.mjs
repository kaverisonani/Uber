console.log("Starting Puppeteer...");

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});
const page = (await browser.pages())[0];
const feedURL = 'https://www.ubereats.com/feed?...';

console.log(`Navigating to: ${feedURL}`);
await page.goto(feedURL, { waitUntil: 'networkidle2', timeout: 60000 });

const cards = 'div:has(> div > div > div > a[data-testid="store-card"])';
await page.waitForSelector(cards);
console.log("Cards found!");

const restaurants = [];
for (const el of await page.$$(cards)) {
  const offer = await el.evaluate(e => e.querySelector('picture + div > div')?.textContent) || '';
  console.log(`Found Offer: ${offer}`);
  
  if (offer.includes('Get 1 Free') || offer.includes('Offers')) {
    const url = await el.evaluate(e => e.querySelector('a').href);
    restaurants.push(url);
  }
}

console.log(`${restaurants.length} potential restaurants with offers found!`);

await browser.close();
console.log("Puppeteer closed.");

// Process each restaurant URL and scrape further data
for (let i = 0; i < restaurants.length; i++) {
  console.log(`Fetching ${restaurants[i]}...`);
  try {
    const body = await fetch(restaurants[i], {
      headers: {
        'user-agent': 'Mozilla/5.0...',
      },
    }).then(res => res.text());
    
    console.log('Fetched data for:', restaurants[i]);
    const reactData = body.match(/__REACT_QUERY_STATE__">(.*?)<\/script>/s)?.[1];
    console.log("React Data:", reactData);

    if (reactData) {
      const rawData = JSON.parse(decodeURIComponent(JSON.parse(`"${reactData.trim()}"`)));
      const data = rawData?.queries?.[0]?.state?.data;
      console.log("Raw Data:", data);
      
      // Process data here and continue with your existing logic
    } else {
      console.log("No react data found for:", restaurants[i]);
    }
  } catch (error) {
    console.error(`Error fetching data for ${restaurants[i]}:`, error.message);
  }

  console.log("Sleeping for 3 seconds...");
  await new Promise(resolve => setTimeout(resolve, 3000));
}
