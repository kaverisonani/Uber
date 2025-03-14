import puppeteer from 'puppeteer';

(async () => {
    console.log("Launching Puppeteer...");

    // Use a proxy to avoid GitHub's IP ban
    const PROXY_SERVER = "http://your-proxy-server:port"; // 🔄 Replace with actual proxy

    const browser = await puppeteer.launch({
        headless: true,
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            `--proxy-server=${PROXY_SERVER}` // Use proxy to avoid getting blocked
        ]
    });

    const page = await browser.newPage();

    // Set a mobile User-Agent to mimic a real user
    await page.setUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.85 Mobile Safari/537.36"
    );

    try {
        console.log("Fetching UberEats...");
        await page.goto("https://www.ubereats.com/", {
            waitUntil: "domcontentloaded",
            timeout: 60000 // Increased timeout
        });

        // Wait for specific element to ensure page has loaded
        await page.waitForSelector("div", { timeout: 10000 });

        console.log("Page loaded successfully!");

        // Extract data (Modify as per requirement)
        const data = await page.evaluate(() => {
            return [...document.querySelectorAll("div")].map(div => div.textContent);
        });

        console.log("Extracted data:", data);

        // Save data to JSON file
        import fs from "fs";
        fs.writeFileSync("scraped.json", JSON.stringify(data, null, 2));

        console.log("Data saved to scraped.json!");

    } catch (error) {
        console.error("Error:", error);
    } finally {
        await browser.close();
    }
})();
