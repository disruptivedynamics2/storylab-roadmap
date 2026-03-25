import { chromium, type Browser } from "playwright";

export interface MetaStoreData {
  storeRating: number;
  storeRatingCount: number;
  storeReviewCount: number;
  reviews: Array<{
    username: string;
    date: string;
    rating: number;
    title: string;
    body: string;
  }>;
}

export async function scrapeMetaStore(url: string): Promise<MetaStoreData> {
  let browser: Browser | null = null;

  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      locale: "en-US",
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    });
    const page = await context.newPage();

    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    // Wait for JS to render the page
    await page.waitForTimeout(10000);

    // Dismiss cookie banners and overlays that block interactions
    try {
      // Meta cookie consent buttons (various languages)
      const cookieSelectors = [
        'button:has-text("Allow all cookies")',
        'button:has-text("Autoriser tous les cookies")',
        'button:has-text("Accept all")',
        'button:has-text("Tout accepter")',
        'button:has-text("Only allow essential cookies")',
        'button:has-text("Decline optional cookies")',
        'button:has-text("Refuser les cookies optionnels")',
        '[data-cookiebanner="accept_button"]',
        '[data-testid="cookie-policy-manage-dialog-accept-button"]',
      ];
      for (const selector of cookieSelectors) {
        const btn = page.locator(selector).first();
        if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
          await btn.click({ force: true });
          console.log(`[scraper] Dismissed cookie banner with: ${selector}`);
          await page.waitForTimeout(1000);
          break;
        }
      }
    } catch {
      // No cookie banner found, that's fine
    }

    // Detect language: FR or EN
    const isFrench = await page.evaluate(() => {
      return document.body.innerText.includes("Signaler cet avis");
    });

    const reportText = isFrench ? "Signaler cet avis" : "Report this review";
    const wasHelpfulText = isFrench ? "Cela vous a-t-il aidé ?" : "Was this helpful?";
    const seeMoreText = isFrench ? "Voir plus" : "See more";
    const showLessText = isFrench ? "Voir moins" : "Show less";
    const showOriginalText = isFrench ? "Afficher l'original" : "Show original";
    const devResponseText = isFrench ? "Réponse du développeur" : "Developer response";

    console.log(`[scraper] Page language: ${isFrench ? "FR" : "EN"}`);

    // 1. Extract overall rating from aria-label on DIV elements
    // FR: "4.4054054054054 sur 5"  |  EN: "4.4 out of 5 rating"
    let storeRating = 0;
    const ariaRatings = await page.evaluate(() => {
      const els = document.querySelectorAll("[aria-label]");
      const results: string[] = [];
      els.forEach((el) => {
        const label = el.getAttribute("aria-label") || "";
        if (label.match(/[\d.]+\s*(out of|sur)\s*5/)) {
          results.push(label);
        }
      });
      return results;
    });

    // The first aria-label with a decimal rating is the overall store rating
    for (const label of ariaRatings) {
      const match = label.match(/([\d.]+)\s*(out of|sur)\s*5/);
      if (match) {
        const val = parseFloat(match[1]);
        // Overall rating has decimals (e.g. 4.4054...), individual ones are integers
        if (val !== Math.round(val) || ariaRatings.indexOf(label) === 0) {
          storeRating = Math.round(val * 10) / 10;
          break;
        }
      }
    }

    // 2. Extract ratings count and reviews count
    // FR: "37 évaluations, 21 avis"  |  EN: "37 ratings, 21 reviews"
    let storeRatingCount = 0;
    let storeReviewCount = 0;
    const bodyText = await page.evaluate(() => document.body.innerText);

    const countsMatchFR = bodyText.match(
      /(\d[\d\s,]*)\s*[ée]valuations?,\s*(\d[\d\s,]*)\s*avis/i
    );
    const countsMatchEN = bodyText.match(
      /(\d[\d,]*)\s*ratings?,\s*(\d[\d,]*)\s*reviews?/i
    );
    const countsMatch = countsMatchFR || countsMatchEN;
    if (countsMatch) {
      storeRatingCount = parseInt(countsMatch[1].replace(/[\s,]/g, ""));
      storeReviewCount = parseInt(countsMatch[2].replace(/[\s,]/g, ""));
    }

    console.log(`[scraper] Rating: ${storeRating}, Ratings: ${storeRatingCount}, Reviews: ${storeReviewCount}`);

    // 3. Click "Show more reviews" / "Afficher plus d'avis" repeatedly to load ALL reviews
    let clickCount = 0;
    let prevCount = 0;
    let stableRounds = 0;
    while (clickCount < 50) {
      // Try both French and English button text
      const btn = page
        .locator("text=/Show more reviews|Afficher plus d'avis|Voir plus d'avis/i")
        .first();
      const visible = await btn.isVisible({ timeout: 2000 }).catch(() => false);
      if (!visible) break;

      try {
        await btn.click({ force: true, timeout: 5000 });
      } catch {
        console.log(`[scraper] Could not click "Show more reviews", continuing with current reviews`);
        break;
      }
      await page.waitForTimeout(2000);
      clickCount++;

      // Count current reviews to detect if we're stuck
      const currentCount = await page.evaluate((reportTxt: string) => {
        const walker = document.createTreeWalker(
          document.body,
          NodeFilter.SHOW_TEXT
        );
        let count = 0;
        while (walker.nextNode()) {
          if (walker.currentNode.textContent?.trim() === reportTxt) count++;
        }
        return count;
      }, reportText);

      if (currentCount === prevCount) {
        stableRounds++;
        if (stableRounds >= 3) break;
      } else {
        stableRounds = 0;
      }
      prevCount = currentCount;
    }

    // 4. Click all "Voir plus" / "See more" links within reviews to expand truncated text
    const seeMoreLinks = page.locator(`text=/^${seeMoreText}$/i`);
    const seeMoreCount = await seeMoreLinks.count();
    for (let i = 0; i < seeMoreCount; i++) {
      try {
        const link = seeMoreLinks.nth(i);
        if (await link.isVisible()) {
          await link.click({ force: true, timeout: 3000 });
          await page.waitForTimeout(300);
        }
      } catch {
        // Some might not be clickable, skip
      }
    }
    await page.waitForTimeout(500);

    // 5. Extract individual reviews
    const reviews = await page.evaluate(
      ({
        reportTxt,
        helpfulTxt,
        seeMoreTxt,
        showLessTxt,
        showOrigTxt,
        devRespTxt,
      }: {
        reportTxt: string;
        helpfulTxt: string;
        seeMoreTxt: string;
        showLessTxt: string;
        showOrigTxt: string;
        devRespTxt: string;
      }) => {
        const results: Array<{
          username: string;
          date: string;
          rating: number;
          title: string;
          body: string;
        }> = [];

        // Find all "Signaler cet avis" / "Report this review" text nodes
        const walker = document.createTreeWalker(
          document.body,
          NodeFilter.SHOW_TEXT
        );
        const reportNodes: HTMLElement[] = [];
        while (walker.nextNode()) {
          if (walker.currentNode.textContent?.trim() === reportTxt) {
            const parent = walker.currentNode.parentElement;
            if (parent) reportNodes.push(parent);
          }
        }

        for (const reportEl of reportNodes) {
          let container: HTMLElement | null = reportEl;
          for (let i = 0; i < 10; i++) {
            if (!container?.parentElement) break;
            container = container.parentElement;
            const text = container.innerText || "";

            const reportCount = (text.match(new RegExp(reportTxt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), "g")) || []).length;
            // Look for profile images (FR: "Photo de profil", EN: "Profile photo")
            const hasProfile = container.querySelector(
              'img[alt*="photo" i], img[alt*="profil" i], img[alt*="Profile" i], img[alt*="avatar" i]'
            );

            if (reportCount === 1 && hasProfile && text.length > 50) {
              // Extract star rating from aria-label
              // FR: "5 sur 5"  |  EN: "5 out of 5 rating"
              let rating = 0;
              const ratingEl = container.querySelector(
                '[aria-label*="sur 5"], [aria-label*="out of 5"]'
              );
              if (ratingEl) {
                const m = ratingEl
                  .getAttribute("aria-label")
                  ?.match(/([\d.]+)\s*(sur|out of)\s*5/);
                if (m) rating = Math.round(parseFloat(m[1]));
              }

              // Parse text lines
              const lines = text
                .split("\n")
                .map((l) => l.trim())
                .filter(Boolean);

              // Filter out boilerplate text
              const boilerplate = [
                reportTxt,
                helpfulTxt,
                seeMoreTxt,
                showLessTxt,
                showOrigTxt,
                devRespTxt,
                "En savoir plus",
                "Photo de profil",
                "Profile photo",
              ];

              const filtered = lines.filter((l) => {
                // Remove boilerplate
                if (boilerplate.some((b) => l === b)) return false;
                // Remove standalone numbers (helpful counts)
                if (l.match(/^\d+$/)) return false;
                // Remove developer response blocks entirely
                // When we encounter "Réponse du développeur" / "Developer response",
                // skip everything from that point in this container
                return true;
              });

              // Remove developer response block: find the index and cut
              const devRespIndex = filtered.findIndex(
                (l) => l === devRespTxt || l.startsWith(devRespTxt)
              );
              const cleanLines = devRespIndex >= 0
                ? filtered.slice(0, devRespIndex)
                : filtered;

              // Structure: [username, date, title?, body...]
              const username = cleanLines[0] || "";
              const date = cleanLines[1] || "";
              let title = "";
              let bodyParts: string[] = [];

              if (cleanLines.length >= 4) {
                title = cleanLines[2] || "";
                bodyParts = cleanLines.slice(3);
              } else if (cleanLines.length === 3) {
                const third = cleanLines[2];
                if (third.length < 80) {
                  title = third;
                } else {
                  bodyParts = [third];
                }
              }

              const body = bodyParts.join(" ");

              if (username && rating > 0) {
                results.push({ username, date, rating, title, body });
              }
              break;
            }
          }
        }

        return results;
      },
      {
        reportTxt: reportText,
        helpfulTxt: wasHelpfulText,
        seeMoreTxt: seeMoreText,
        showLessTxt: showLessText,
        showOrigTxt: showOriginalText,
        devRespTxt: devResponseText,
      }
    );

    console.log(`[scraper] Extracted ${reviews.length} reviews`);

    return {
      storeRating,
      storeRatingCount,
      storeReviewCount,
      reviews,
    };
  } finally {
    if (browser) await browser.close();
  }
}
