const scanButton = document.getElementById('scan');
const statusMessage = document.getElementById('status');
const linkResults = document.getElementById('linkResults');

// Handle Scan Button Click
scanButton.addEventListener('click', () => {
    statusMessage.textContent = '🔄 Scanning...';

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs.length === 0 || !tabs[0].id) {
            statusMessage.textContent = '⚠️ No active tab found.';
            return;
        }

        chrome.tabs.sendMessage(
            tabs[0].id,
            { action: 'scanPage' },
            (response) => {
                if (chrome.runtime.lastError) {
                    console.error('❌ Error:', chrome.runtime.lastError.message);
                    statusMessage.textContent = '❌ Failed to communicate with content script.';
                } else if (response && response.status === 'Scanning Complete') {
                    statusMessage.textContent = '✅ Page scan complete!';
                    displayLinkResults(response.results || []);
                } else {
                    statusMessage.textContent = '⚠️ No response from content script.';
                }
            }
        );
    });
});

// Display Link Results
function displayLinkResults(links) {
    linkResults.innerHTML = ''; // Clear previous results

    links.forEach(link => {
        const div = document.createElement('div');
        div.textContent = `${link.url}`;

        if (link.status === 'safe') {
            div.className = 'link-item safe';
        } else if (link.status === 'caution' || link.status === 'time-suspicious') {
            div.className = 'link-item caution';
        } else if (link.status === 'suspicious') {
            div.className = 'link-item suspicious';
        } else if (link.status === 'dangerous') {
            div.className = 'link-item dangerous';
        }

        linkResults.appendChild(div);
    });
}

// show whitelist data from storage to linkResults on click of whitelist button
const whitelistButton = document.getElementById('whitelist');
whitelistButton.addEventListener('click', () => {
    chrome.storage.local.get('whitelist', (data) => {
        console.log(data.whitelist)
        const whitelist = data.whitelist || [];
        linkResults.innerHTML = ''; // Clear previous results
        
        if (whitelist.length === 0) {
            const div = document.createElement('div');
            div.textContent = 'No whitelisted links found.';
            div.className = 'link-item info';
            linkResults.appendChild(div);
            return;
        }

        whitelist.forEach(url => {
            const div = document.createElement('div');
            div.textContent = `${url}`;
            div.className = 'link-item whitelist';
            linkResults.appendChild(div);
        });
    });
});

// Show blacklist/dangerous links on button click
const blacklistButton = document.getElementById('blacklist');
blacklistButton.addEventListener('click', () => {
    chrome.storage.local.get('blacklist', (data) => {
        console.log(data.blacklist);
        const blacklist = data.blacklist || [];
        linkResults.innerHTML = ''; // Clear previous results
        
        if (blacklist.length === 0) {
            const div = document.createElement('div');
            div.textContent = 'No dangerous links found.';
            div.className = 'link-item info';
            linkResults.appendChild(div);
            return;
        }

        blacklist.forEach(url => {
            const div = document.createElement('div');
            div.textContent = `${url}`;
            div.className = 'link-item dangerous';
            linkResults.appendChild(div);
        });
    });
});