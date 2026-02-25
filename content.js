console.log('✅ content.js successfully loaded');
// Add tooltip styles to the page
const style = document.createElement('style');
style.textContent = `
  .phishing-tooltip {
  position: absolute;
  background: #1a1a1a;
  color: #fff;
  padding: 8px 12px;
  border-radius: 4px;
  font-family: Arial, sans-serif;
  font-size: 14px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.2);
  z-index: 2147483647;
  max-width: 300px;
  word-wrap: break-word;
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.2s, visibility 0.2s;
  transform: translateX(-50%);
  pointer-events: auto;
}

.phishing-tooltip.show {
  opacity: 1;
  visibility: visible;
}

.phishing-tooltip button {
  display: block;
  margin-top: 6px;
  padding: 6px 10px;
  background: #4CAF50;
  color: white;
  border: none;
  border-radius: 3px;
  cursor: pointer;
}

.phishing-tooltip button:hover {
  background: #45a049;
}

.phishing-tooltip .mark-dangerous {
  background: #F44336;
}

.phishing-tooltip .mark-dangerous:hover {
  background: #D32F2F;
}


`;
document.head.appendChild(style);
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('📩 Message received in content.js:', request);

  if (request.action === 'scanPage') {
    console.log('🔍 Scan initiated from popup...');
    // Use async IIFE to handle async highlightLinks
    (async () => {
      const scanResults = await highlightLinks();
      attachHoverEvents();
      sendResponse({ status: 'Scanning Complete', results: scanResults });
    })();
    return true; // Keep message channel open for async response
  }
});

async function highlightLinks() {
  const links = document.querySelectorAll('a');
  let results = [];

  for (const link of links) {
    const url = link.href;
    if (!url) continue;

    // Clear previous styles
    link.style.border = '';
    link.removeAttribute('data-tooltip');

    // Get threat status from background.js
    const resposne = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'checkUrl', url }, (response) => { 
        resolve(response);
      });
    });
    const status = resposne.status;
    console.log({status})
    // Apply styles based on status
    let className, tooltipText;
    switch (status) {
      case 'dangerous':
        className = 'phishing-link-dangerous';
        tooltipText = '🛑 Dangerous: Identified as a threat.';
        break;
      case 'suspicious':
        className = 'phishing-link-suspicious';
        tooltipText = '⚠️ Suspicious: Proceed with caution.';
        break;
      case 'time-suspicious':
        className = 'phishing-link-suspicious';
        tooltipText = '⚠️ Suspicious: This domain is very new or nearly expiring.';
        break;
      default:
        className = 'phishing-link-safe';
        tooltipText = '✅ Safe: This link is secure.';
    }

    link.classList.add(className);
    link.setAttribute('data-tooltip', tooltipText);
    results.push({ url, status });
  }

  console.log('🔗 Scan Results:', results);
  return results;
}

 // Ensure Hover Events Are Attached
 function attachHoverEvents() {
  const links = document.querySelectorAll('a');
  links.forEach(link => {
    if (!link.dataset.tooltipListener) {
      // Show tooltip when mouse enters the link
      link.addEventListener('mouseenter', (event) => {
        window.tooltipTimeout = setTimeout(() => {
          showTooltip(event, link);
        }, 500); // 0.5s delay
      });

      // Hide tooltip when mouse leaves the link
      link.addEventListener('mouseleave', () => {
        clearTimeout(window.tooltipTimeout);
        // Delay hiding the tooltip to allow mouse to move to it
        window.tooltipHideTimeout = setTimeout(() => {
          hideTooltip();
        }, 200); // 0.2s delay
      });

      // Mark the link as having a listener
      link.dataset.tooltipListener = 'true';
    }
  });
}

function showTooltip(event, link) {
  if (!link || !link.getAttribute('data-tooltip')) {
    console.warn('⚠️ Tooltip link is undefined or missing "data-tooltip".');
    return;
  }

  let tooltip = document.querySelector('.phishing-tooltip');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.className = 'phishing-tooltip';
    document.body.appendChild(tooltip);
  }

  tooltip.textContent = link.getAttribute('data-tooltip');

  // Add buttons based on link status
  if (link.classList.contains('phishing-link-suspicious') || link.classList.contains('phishing-link-safe')) {
    // Add "Mark as Safe" button if the link is suspicious
    if (link.classList.contains('phishing-link-suspicious')) {
      const markAsSafeButton = document.createElement('button');
      markAsSafeButton.textContent = 'Mark as Safe';
      markAsSafeButton.addEventListener('click', () => {
        markLinkAsSafe(link);
        hideTooltip();
      });
      tooltip.appendChild(markAsSafeButton);
    }
    
    // Add "Mark as Dangerous" button for both safe and suspicious links
    const markAsDangerousButton = document.createElement('button');
    markAsDangerousButton.textContent = 'Mark as Dangerous';
    markAsDangerousButton.className = 'mark-dangerous';
    markAsDangerousButton.addEventListener('click', () => {
      markLinkAsDangerous(link);
      hideTooltip();
    });
    tooltip.appendChild(markAsDangerousButton);
  }

  // Calculate the position of the tooltip
  const rect = link.getBoundingClientRect();
  const scrollX = window.scrollX || window.pageXOffset;
  const scrollY = window.scrollY || window.pageYOffset;

  // Position the tooltip above or below the link based on available space
  if (rect.top - tooltip.offsetHeight - 10 < 0) {
    // Not enough space above, position below the link
    tooltip.style.top = `${rect.bottom + scrollY + 10}px`;
  } else {
    // Position above the link
    tooltip.style.top = `${rect.top + scrollY - tooltip.offsetHeight - 10}px`;
  }

  // Center the tooltip horizontally relative to the link
  tooltip.style.left = `${rect.left + scrollX + (rect.width / 2)}px`;

  // Constrain the tooltip width to prevent overflow
  tooltip.style.maxWidth = `${window.innerWidth - rect.left - 20}px`;

  // Show the tooltip
  tooltip.classList.add('show');

  // Add event listeners to the tooltip
  tooltip.addEventListener('mouseenter', () => {
    clearTimeout(window.tooltipHideTimeout); // Prevent hiding
  });

  tooltip.addEventListener('mouseleave', () => {
    // Hide the tooltip after a short delay
    window.tooltipHideTimeout = setTimeout(() => {
      hideTooltip();
    }, 200); // 0.2s delay
  });
}

function markLinkAsSafe(link) {
  // Update the link's status to safe
  link.classList.remove('phishing-link-suspicious', 'phishing-link-caution', 'phishing-link-dangerous');
  link.classList.add('phishing-link-safe');
  link.setAttribute('data-tooltip', '✅ This link is safe! Proceed with confidence.');

  // Update the results array (if needed)
  const url = link.href;
  const results = Array.from(document.querySelectorAll('a')).map(link => ({
    url: link.href,
    status: link.classList.contains('phishing-link-safe') ? 'safe' : 
            link.classList.contains('phishing-link-caution') ? 'caution' : 'suspicious'
  }));

  // Optionally, save the user's choice to chrome.storage
  chrome.storage.local.set({ [url]: 'safe' }, () => {
    console.log(`✅ ${url} marked as safe by the user.`);
  });
  //add safe link in the whitelist in local storage
  chrome.storage.local.get(['whitelist', 'blacklist'], (data) => {
    let whitelist = data.whitelist || [];
    let blacklist = data.blacklist || [];
    
    // Remove from blacklist if present
    if (blacklist.includes(url)) {
      blacklist = blacklist.filter(item => item !== url);
      chrome.storage.local.set({ blacklist });
      console.log(`✅ ${url} removed from the blacklist.`);
    }
    
    // Add to whitelist if not already there
    if (!whitelist.includes(url)) {
      whitelist.push(url);
      chrome.storage.local.set({ whitelist }, () => {
        console.log(`✅ ${url} added to the whitelist.`);
      });
    }
  });
}

function markLinkAsDangerous(link) {
  // Update the link's status to dangerous
  link.classList.remove('phishing-link-suspicious', 'phishing-link-caution', 'phishing-link-safe');
  link.classList.add('phishing-link-dangerous');
  link.setAttribute('data-tooltip', '🛑 Marked as dangerous by you.');

  const url = link.href;
  
  // Save to blacklist
  chrome.storage.local.get(['blacklist', 'whitelist'], (data) => {
    let blacklist = data.blacklist || [];
    let whitelist = data.whitelist || [];
    
    // Remove from whitelist if present
    if (whitelist.includes(url)) {
      whitelist = whitelist.filter(item => item !== url);
      chrome.storage.local.set({ whitelist });
      console.log(`✅ ${url} removed from the whitelist.`);
    }
    
    // Add to blacklist if not already there
    if (!blacklist.includes(url)) {
      blacklist.push(url);
      chrome.storage.local.set({ blacklist }, () => {
        console.log(`🛑 ${url} added to the blacklist.`);
      });
    }
  });
}

function hideTooltip() {
  const tooltip = document.querySelector('.phishing-tooltip');
  if (tooltip) {
    tooltip.classList.remove('show');
    setTimeout(() => {
      tooltip.remove();
    }, 200);
  }
  // Clear any pending timeouts
  clearTimeout(window.tooltipHideTimeout);
}

// Check for suspicious patterns
function isPhishingLink(url) {
  const patterns = [/login/i, /verify/i, /account/i, /secure/i, /password/i];
  return patterns.some(pattern => pattern.test(url));
}

// Check for caution patterns
function isCautionLink(url) {
  const patterns = [/update/i, /confirm/i, /user/i, /id/i];
  return patterns.some(pattern => pattern.test(url));
}

// Ensure Hover Events Are Attached on Initial Load
attachHoverEvents();
function loadUserPreferences() {
  chrome.storage.local.get(['whitelist', 'blacklist'], (items) => {
    const links = document.querySelectorAll('a');
    links.forEach(link => {
      const url = link.href;
      if (items.whitelist && items.whitelist.includes(url)) {
        markLinkAsSafe(link);
      } else if (items.blacklist && items.blacklist.includes(url)) {
        markLinkAsDangerous(link);
      }
    });
  });
}

// Call this function when the content script loads
loadUserPreferences();