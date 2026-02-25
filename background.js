console.log('✅ background.js successfully loaded');

// Hardcoded API key (for demonstration purposes only) (If you want to use this code you must insert your own GoogleSafeBrowsing API key in the section below :D
const API_KEY = '';

// Initialize phishing signatures, whitelist, and blacklist
chrome.storage.local.get(['phishingSignatures', 'whitelist', 'blacklist'], (data) => {
  if (!data.phishingSignatures) {
    chrome.storage.local.set({ phishingSignatures: ['evil.com/phish', 'malicious.net/login'] });
  }
  if (!data.whitelist) {
    chrome.storage.local.set({ whitelist: [] });
  }
  if (!data.blacklist) {
    chrome.storage.local.set({ blacklist: [] });
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('📩 Message received in background.js:', request);

  if (!request || !request.action) {
    console.warn('⚠️ Invalid request format:', request);
    sendResponse({ status: 'Error: Invalid request format' });
    return false; // Stop execution
  }

  if (request.action === 'checkUrl') {
    handleCheckUrl(request.url).then((status) => {
      console.log({ status });
      sendResponse({ status }); 
    }).catch((error) => {
      console.error('🚨 Error in handleCheckUrl:', error);
      sendResponse({ status: 'Error', message: error.message });
    });
    return true; // ✅ Keep connection alive for async response
  }

  if (request.action === 'markSafe') {
    chrome.storage.local.get(['whitelist', 'blacklist'], (data) => {
      let whitelist = data.whitelist || [];
      let blacklist = data.blacklist || [];
      
      // Remove from blacklist if present
      if (blacklist.includes(request.url)) {
        blacklist = blacklist.filter(item => item !== request.url);
        chrome.storage.local.set({ blacklist });
      }
      
      // Add to whitelist
      if (!whitelist.includes(request.url)) {
        whitelist.push(request.url);
        chrome.storage.local.set({ whitelist }, () => {
          sendResponse({ status: 'success' });
        });
      } else {
        sendResponse({ status: 'Already in whitelist' });
      }
    });
    return true; // ✅ Needed for async storage
  }

  if (request.action === 'markDangerous') {
    chrome.storage.local.get(['whitelist', 'blacklist'], (data) => {
      let blacklist = data.blacklist || [];
      let whitelist = data.whitelist || [];
      
      // Remove from whitelist if present
      if (whitelist.includes(request.url)) {
        whitelist = whitelist.filter(item => item !== request.url);
        chrome.storage.local.set({ whitelist });
      }
      
      // Add to blacklist
      if (!blacklist.includes(request.url)) {
        blacklist.push(request.url);
        chrome.storage.local.set({ blacklist }, () => {
          sendResponse({ status: 'success' });
        });
      } else {
        sendResponse({ status: 'Already in blacklist' });
      }
    });
    return true; // ✅ Needed for async storage
  }

  if (request.action === 'validateUrl' && request.url) {
    if (isPhishingLink(request.url)) {
      console.warn('⚠️ Heuristic detection flagged the URL as suspicious:', request.url);
      sendResponse({ status: 'Suspicious: Heuristic Detection' });
      return true;
    }

    checkURLWithGoogleSafeBrowsing(request.url).then((googleResponse) => {
      if (googleResponse.length > 0) {
        console.log('✅ Google Safe Browsing detected threats:', googleResponse);
        sendResponse({ status: 'Unsafe: Google Safe Browsing', details: googleResponse });
      } else {
        sendResponse({ status: 'Safe' });
      }
    }).catch((error) => {
      console.error('🚨 Google Safe Browsing error:', error);
      sendResponse({ status: 'Error', message: error.message });
    });

    return true; // ✅ Keep response alive
  }

  console.warn('⚠️ Unknown action received:', request.action);
  sendResponse({ status: 'Error: Unknown action' });
  return false;
});


async function handleCheckUrl(url) {
  try {
    // Check whitelist and blacklist
    const { whitelist, blacklist } = await chrome.storage.local.get(['whitelist', 'blacklist']);
    if (whitelist && whitelist.includes(url)) return 'safe';
    if (blacklist && blacklist.includes(url)) return 'dangerous';

    // Layer 1: Google Safe Browsing
    const googleResults = await checkURLWithGoogleSafeBrowsing(url);
    if (googleResults.length > 0) return 'dangerous';

     // Layer 2: Time-based detection
     const timeResult = await checkDomainAge(url);
     if (timeResult === 'suspicious') return 'suspicious';

    // Layer 3: Signature Check
    const { phishingSignatures } = await chrome.storage.local.get('phishingSignatures');
    if (phishingSignatures && phishingSignatures.some(sig => url.includes(sig))) return 'dangerous';
    
    // Layer 4: Heuristic Check
    if (isPhishingLink(url)) return 'suspicious'; 
    
    return 'safe';
  } catch (error) {
    console.error("Error in handleCheckUrl:", error);
    return 'safe'; // Default to safe on error
  }
}

// Extract domain from URL
function extractDomain(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch (e) {
    console.error("Invalid URL:", url);
    return url;
  }
}

// Check domain age using WHOIS API
async function checkDomainAge(url) {
  try {
    const domain = extractDomain(url);
    // Use WHOIS API to get domain information
    const whoisResponse = await fetch(`https://whois.freeapi.io/api/v1/${domain}`);
    
    if (!whoisResponse.ok) {
      console.warn(`WHOIS API request failed for ${domain}`);
      return 'unknown';
    }
    
    const whoisData = await whoisResponse.json();
    
    if (whoisData.domain && whoisData.domain.created) {
      const creationDate = new Date(whoisData.domain.created);
      const currentDate = new Date();
      
      // Calculate domain age in days
      const domainAgeInDays = Math.floor((currentDate - creationDate) / (1000 * 60 * 60 * 24));
      
      // Check if domain is less than 30 days old
      if (domainAgeInDays < 30) {
        console.log(`Domain ${domain} is only ${domainAgeInDays} days old - suspicious`);
        return 'suspicious';
      }
      
      // Check expiration if available
      if (whoisData.domain.expires) {
        const expirationDate = new Date(whoisData.domain.expires);
        const timeUntilExpiration = expirationDate - currentDate;
        const daysUntilExpiration = Math.floor(timeUntilExpiration / (1000 * 60 * 60 * 24));
        
        // Check if domain expires within 60 days
        if (daysUntilExpiration <= 60) {
          console.log(`Domain ${domain} expires in ${daysUntilExpiration} days - suspicious`);
          return 'suspicious';
        }
      }
    }
    
    return 'safe';
  } catch (error) {
    console.error("Error checking domain age:", error);
    return 'unknown';
  }
}

// Function to check URL against Google Safe Browsing
async function checkURLWithGoogleSafeBrowsing(url) {
    const safeBrowsingApiUrl = `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${API_KEY}`;
    const requestBody = {
        client: {
            clientId: "PhishingCatcher",
            clientVersion: "1.0"
        },
        threatInfo: {
            threatTypes: ["MALWARE", "SOCIAL_ENGINEERING"],
            platformTypes: ["WINDOWS"],
            threatEntryTypes: ["URL"],
            threatEntries: [
                {url: url}
            ]
        }
    };

    try {
        const response = await fetch(safeBrowsingApiUrl, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(requestBody)
        });
        const data = await response.json();
        return data.matches ? data.matches : [];
    } catch (error) {
        console.error('Error with Google Safe Browsing API:', error);
        return [];
    }
}

// Function to perform heuristic checks
function isPhishingLink(url) {
    const patterns = [/login/i, /verify/i, /account/i, /secure/i, /password/i];
    return patterns.some(pattern => pattern.test(url));
}

