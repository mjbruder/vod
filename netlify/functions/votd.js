// SIMPLE IN-MEMORY CACHE (Resets when Netlify spins down the function)
let cachedData = null;
let lastFetchTime = 0;

export async function handler(event, context) {
  const CACHE_DURATION = 1000 * 60 * 60; // 1 Hour in milliseconds

  // 1. Check In-Memory Cache first (Fastest)
  const now = Date.now();
  if (cachedData && (now - lastFetchTime < CACHE_DURATION)) {
    console.log("Serving from In-Memory Cache");
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        // Tell Browser: Don't cache (check with server)
        // Tell Netlify CDN: Cache this for 3600 seconds (1 hour)
        "Cache-Control": "public, max-age=0, s-maxage=3600" 
      },
      body: JSON.stringify(cachedData)
    };
  }

  // 2. Prepare for Fresh Fetch
  const today = new Date();
  const start = new Date(today.getFullYear(), 0, 0);
  const diff = today - start;
  const oneDay = 1000 * 60 * 60 * 24;
  const dayOfYear = Math.floor(diff / oneDay);

  if (!process.env.YOUVERSION_API_KEY) {
    console.error("Missing YOUVERSION_API_KEY");
    return { statusCode: 500, body: JSON.stringify({ error: "Server config error" }) };
  }

  // ID 111 = NIV (Licensed)
  const bibleId = "111"; 

  try {
    // --- STEP 1: Get the Passage ID ---
    const votdUrl = `https://api.youversion.com/v1/verse_of_the_days/${dayOfYear}`;
    console.log(`Fetching FRESH VOTD ID from: ${votdUrl}`);

    const votdResponse = await fetch(votdUrl, {
      headers: {
        "X-YVP-App-Key": process.env.YOUVERSION_API_KEY,
        "Accept": "application/json"
      }
    });

    if (!votdResponse.ok) {
      throw new Error(`VOTD Endpoint Error: ${votdResponse.status}`);
    }

    const votdData = await votdResponse.json();

    // Flexible extraction logic
    let passageId = votdData.passage_id;
    if (!passageId && votdData.data) {
       passageId = Array.isArray(votdData.data) ? votdData.data[0]?.passage_id : votdData.data.passage_id;
    }

    if (!passageId) {
      throw new Error("No passage_id found in response");
    }

    // --- STEP 2: Get the Verse Text ---
    const passageUrl = `https://api.youversion.com/v1/bibles/${bibleId}/passages/${passageId}`;
    console.log(`Fetching FRESH Text from: ${passageUrl}`);

    const textResponse = await fetch(passageUrl, {
      headers: {
        "X-YVP-App-Key": process.env.YOUVERSION_API_KEY,
        "Accept": "application/json"
      }
    });

    if (!textResponse.ok) {
      throw new Error(`Passage Endpoint Error: ${textResponse.status}`);
    }

    const textData = await textResponse.json();
    
    // --- STEP 3: Format & Store in Cache ---
    const verseText = textData.content || textData.text || "Text unavailable";
    const humanReference = textData.reference || textData.human_reference || passageId;
    const verseUrl = `https://www.bible.com/bible/${bibleId}/${passageId}`;

    // Create the final object
    const finalResponseData = {
      verse: {
        text: verseText,
        human_reference: humanReference,
        url: verseUrl
      }
    };

    // Update In-Memory Cache
    cachedData = finalResponseData;
    lastFetchTime = Date.now();

    return {
      statusCode: 200,
      headers: { 
        "Content-Type": "application/json",
        // IMPORTANT: This header tells Netlify to serve this exact response 
        // to other users for the next 3600 seconds without running this code again.
        "Cache-Control": "public, max-age=0, s-maxage=3600" 
      },
      body: JSON.stringify(finalResponseData)
    };

  } catch (err) {
    console.error("Function Error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
}