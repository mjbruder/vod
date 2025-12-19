export async function handler(event, context) {
  // 1. Calculate Day of Year
  const today = new Date();
  const start = new Date(today.getFullYear(), 0, 0);
  const diff = today - start;
  const oneDay = 1000 * 60 * 60 * 24;
  const dayOfYear = Math.floor(diff / oneDay);

  if (!process.env.YOUVERSION_API_KEY) {
    console.error("Missing YOUVERSION_API_KEY");
    return { statusCode: 500, body: JSON.stringify({ error: "Server config error" }) };
  }

  const bibleId = "111"; // NIV

  try {
    // --- STEP 1: Get the Passage ID ---
    const votdUrl = `https://api.youversion.com/v1/verse_of_the_days/${dayOfYear}`;
    console.log(`Fetching VOTD ID from: ${votdUrl}`);

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

    // *** CRITICAL DEBUG LOG ***
    // This will appear in your Netlify logs so you can see the EXACT structure
    console.log("VOTD RAW RESPONSE:", JSON.stringify(votdData, null, 2));

    // Flexible extraction: Try multiple common locations for the ID
    let passageId = null;
    
    if (votdData.data && Array.isArray(votdData.data) && votdData.data.length > 0) {
      // Structure: { data: [ { passage_id: "..." } ] } (Documentation standard)
      passageId = votdData.data[0].passage_id;
    } else if (votdData.data && votdData.data.passage_id) {
      // Structure: { data: { passage_id: "..." } } (Single object variant)
      passageId = votdData.data.passage_id;
    } else if (votdData.passage_id) {
      // Structure: { passage_id: "..." } (Root level variant)
      passageId = votdData.passage_id;
    }

    if (!passageId) {
      // If we still can't find it, the schedule for this day might be empty
      throw new Error(`No passage_id found. Keys received: ${Object.keys(votdData).join(", ")}`);
    }

    // --- STEP 2: Get the Verse Text ---
    const passageUrl = `https://api.youversion.com/v1/bibles/${bibleId}/passages/${passageId}`;
    console.log(`Fetching Text from: ${passageUrl}`);

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
    console.log("TEXT RAW RESPONSE:", JSON.stringify(textData, null, 2));

    // --- STEP 3: Format Output ---
    const verseText = textData.content || textData.text || textData.html || "Text unavailable";
    
    // Ensure reference format is like "Matthew 15:13"
    // The API usually returns this in 'reference' or 'human_reference'
    const humanReference = textData.reference || textData.human_reference || passageId;
    
    const verseUrl = `https://www.bible.com/bible/${bibleId}/${passageId}`;

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        verse: {
          text: verseText,
          human_reference: humanReference,
          url: verseUrl
        }
      })
    };

  } catch (err) {
    console.error("Function Error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
}