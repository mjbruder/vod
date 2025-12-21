// Global Cache: Stores the data AND the day it belongs to
let memoryCache = {
  day: null,
  data: null,
  timestamp: 0
};

export async function handler(event, context) {
  // 1. Determine which day to fetch
  // We look for ?day=XXX from the frontend. 
  // If missing, fallback to Server UTC time (Legacy support).
  let dayToFetch;
  
  if (event.queryStringParameters && event.queryStringParameters.day) {
    dayToFetch = parseInt(event.queryStringParameters.day, 10);
  } else {
    // Fallback: Server Time Calculation
    const today = new Date();
    const start = new Date(today.getFullYear(), 0, 0);
    const diff = today - start;
    const oneDay = 1000 * 60 * 60 * 24;
    dayToFetch = Math.floor(diff / oneDay);
  }

  // 2. Check In-Memory Cache
  // Logic: Is there data? Is it for the SAME day requested? Is it less than 1 hour old?
  const CACHE_DURATION = 1000 * 60 * 60; // 1 Hour
  const now = Date.now();

  if (memoryCache.data && 
      memoryCache.day === dayToFetch && 
      (now - memoryCache.timestamp < CACHE_DURATION)) {
    
    console.log(`Serving Day ${dayToFetch} from In-Memory Cache`);
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        // Cache this specific URL (?day=XXX) for 1 hour on the CDN
        "Cache-Control": "public, max-age=0, s-maxage=3600"
      },
      body: JSON.stringify(memoryCache.data)
    };
  }

  // --- External Fetch Logic ---
  if (!process.env.YOUVERSION_API_KEY) {
    console.error("Missing YOUVERSION_API_KEY");
    return { statusCode: 500, body: JSON.stringify({ error: "Server config error" }) };
  }

  // ID 206 = World English Bible (Public Domain)
  //const bibleId = "206"; 
  // ID 111 = NIV (Licensed)
  const bibleId = "111"; 

  try {
    // Step 1: Get Passage ID
    const votdUrl = `https://api.youversion.com/v1/verse_of_the_days/${dayToFetch}`;
    console.log(`Fetching ID for Day ${dayToFetch} from: ${votdUrl}`);

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
    
    // Extract ID safely
    let passageId = null;
    if (votdData.data && Array.isArray(votdData.data) && votdData.data.length > 0) {
      passageId = votdData.data[0].passage_id;
    } else if (votdData.data && votdData.data.passage_id) {
      passageId = votdData.data.passage_id;
    } else if (votdData.passage_id) {
      passageId = votdData.passage_id;
    }

    if (!passageId) {
      throw new Error(`No passage_id found for day ${dayToFetch}`);
    }

    // Step 2: Get Text
    const passageUrl = `https://api.youversion.com/v1/bibles/${bibleId}/passages/${passageId}`;
    console.log(`Fetching Text for Day ${dayToFetch}`);

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

    // Step 3: Format Data
    const verseText = textData.content || textData.text || textData.html || "Text unavailable";
    const humanReference = textData.reference || textData.human_reference || passageId;
    const verseUrl = `https://www.bible.com/bible/${bibleId}/${passageId}`;

    const finalData = {
      verse: {
        text: verseText,
        human_reference: humanReference,
        url: verseUrl
      }
    };

    // Update In-Memory Cache with the specific day
    memoryCache = {
      day: dayToFetch,
      data: finalData,
      timestamp: Date.now()
    };

    return {
      statusCode: 200,
      headers: { 
        "Content-Type": "application/json",
        // Cache this specific day request for 1 hour on CDN
        "Cache-Control": "public, max-age=0, s-maxage=3600"
      },
      body: JSON.stringify(finalData)
    };

  } catch (err) {
    console.error("Function Error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
}