// --- LANGUAGE TOGGLE LOGIC ---
function setLang(el) {
    document.querySelectorAll('.lang-toggle span').forEach(span => {
        span.classList.remove('active');
    });
    el.classList.add('active');
}

// --- CONFIGURATION ---
const URL = "./"; // FIXED PATH FOR GITHUB PAGES
let model, webcam, maxPredictions;
let isScanning = false;
let currentDiagnosis = "Clean"; 
let auditHistory = {}; 

// --- SMOOTHING VARIABLES (THE FIX) ---
let lastRan = 0;
const PREDICTION_INTERVAL = 500; // Only predict every 500ms (0.5 seconds)

// --- EXPERT KNOWLEDGE BASE ---
const ADVICE_DB = {
    "SCAB": {
        title: "SCAB DETECTED",
        steps: `
            <li>Spray recommended fungicide immediately.</li>
            <li>Re-scan this batch after 5–7 days.</li>
        `,
        verdict: "ACTION: DOWNGRADE FROM GRADE A",
        verdictClass: "verdict-warning"
    },
    "ROT": {
        title: "ROT DETECTED",
        steps: `
            <li>Remove infected fruit to prevent spread.</li>
            <li>Inspect surrounding crates for contamination.</li>
        `,
        verdict: "CRITICAL: REJECT BATCH (DO NOT SHIP)",
        verdictClass: "verdict-danger"
    },
    "FRESH": {
        title: "BATCH CLEAN",
        steps: `<li>Fruit quality meets Grade A standards.</li>`,
        verdict: "READY FOR SHIPMENT",
        verdictClass: "verdict-success"
    }
};

// --- INITIALIZATION ---
window.onload = function() {
    generateBatchID();
    startGPS();
};

function generateBatchID() {
    const batchNum = Math.floor(Math.random() * 9000) + 1000;
    document.getElementById('batch-id').innerText = `BATCH-2025-${batchNum}`;
}

function startGPS() {
    document.getElementById('location-id').innerText = "📡 Locating Satellites...";
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(successGPS, errorGPS);
    } else {
        document.getElementById('location-id').innerText = "⚠️ GPS Not Supported";
    }
}

async function successGPS(position) {
    const lat = position.coords.latitude;
    const lon = position.coords.longitude;
    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`);
        const data = await response.json();
        
        // Smarter Fallback: Checks every possible location type
        const locationName = data.address.city || 
                             data.address.town || 
                             data.address.village || 
                             data.address.suburb || 
                             data.address.neighbourhood ||
                             data.address.county || 
                             data.address.district ||
                             "Unknown Location";
                             
        const state = data.address.state || "";
        
        // Update the UI
        document.getElementById('location-id').innerText = `📍 ${locationName}, ${state}`;
    } catch (error) {
        // If internet fails, just show coordinates
        document.getElementById('location-id').innerText = `📍 Lat: ${lat.toFixed(2)}`;
    }
}


function errorGPS() {
    document.getElementById('location-id').innerText = "🚫 Location Denied";
}

// --- EVIDENCE & QR LOGIC ---
window.recallEvidence = function(batchID) {
    const record = auditHistory[batchID];
    if (!record) {
        alert("Error: Evidence not found for this batch.");
        return;
    }

    const certArea = document.getElementById('certificate-area');
    certArea.style.display = "block";
    
    document.getElementById('cert-details').innerText = `${batchID} • ${record.location} • ${record.time}`;
    
    var qr = new QRious({
      element: document.getElementById('sticker-qr'),
      value: `CERTIFIED-GRADE-A | ${batchID} | ${record.location} | ${record.time}`,
      size: 80,
      background: 'white',
      foreground: 'black'
    });

    document.getElementById('large-proof').src = record.img;
    certArea.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// --- AI & CAMERA LOGIC ---
async function init() {
    const modelURL = URL + "model.json";
    const metadataURL = URL + "metadata.json";

    model = await tmImage.load(modelURL, metadataURL);
    maxPredictions = model.getTotalClasses();

    const video = document.getElementById('webcam');
    const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: "environment" } 
    });
    video.srcObject = stream;
    video.play();
    isScanning = true;
    requestAnimationFrame(loop);
}

// --- THE SMOOTHING LOOP ---
async function loop(timestamp) {
    if (isScanning) {
        // Only run logic if 500ms has passed since last run
        if (timestamp - lastRan >= PREDICTION_INTERVAL) {
            await predictGrid();
            lastRan = timestamp;
        }
        requestAnimationFrame(loop);
    }
}

async function predictGrid() {
    const video = document.getElementById('webcam');
    const canvas = document.getElementById('crop-canvas');
    const ctx = canvas.getContext('2d');
    
    const vW = video.videoWidth;
    const vH = video.videoHeight;
    const halfW = vW / 2;
    const halfH = vH / 2;

    const zones = [
        { id: 'box-0', x: 0,     y: 0,     w: halfW, h: halfH }, 
        { id: 'box-1', x: halfW, y: 0,     w: halfW, h: halfH }, 
        { id: 'box-2', x: 0,     y: halfH, w: halfW, h: halfH }, 
        { id: 'box-3', x: halfW, y: halfH, w: halfW, h: halfH } 
    ];

    let foundIssues = new Set();
    
    for (let i = 0; i < zones.length; i++) {
        const zone = zones[i];
        ctx.drawImage(video, zone.x, zone.y, zone.w, zone.h, 0, 0, 150, 150);
        const prediction = await model.predict(canvas);

        let highestProb = 0;
        let bestIndex = 0; 
        for (let j = 0; j < maxPredictions; j++) {
            if (prediction[j].probability > highestProb) {
                highestProb = prediction[j].probability;
                bestIndex = j;
            }
        }

        const boxDiv = document.getElementById(zone.id);
        
        // 0 = Fresh, 1/2 = Defects
        if (bestIndex === 0) {
            boxDiv.className = "grid-box status-ok";
            boxDiv.innerText = "OK";
        } else {
            let defectName = (bestIndex === 1) ? "SCAB" : "ROT";
            // Threshold Check: Only show defect if > 85% confident
            if (highestProb > 0.85) { 
                boxDiv.className = "grid-box status-bad";
                boxDiv.innerText = defectName;
                foundIssues.add(defectName);
            } else {
                boxDiv.className = "grid-box status-ok";
                boxDiv.innerText = "OK";
            }
        }
    }
    updatePanel(foundIssues);
}

// --- UI UPDATES ---
function updatePanel(issues) {
    const panel = document.getElementById('advice-content');
    
    if (issues.size === 0) {
        // Clean State
        panel.innerHTML = `
            <div class="advice-body">
                <div class="defect-warning" style="color:#2ecc71">✅ BATCH CLEAN</div>
                <ul class="action-list"><li>Quality meets Grade A standards.</li></ul>
            </div>
            <div class="verdict-box verdict-success">READY FOR SHIPMENT</div>
        `;
        currentDiagnosis = "Clean";
    } else {
        // Defect State
        let htmlContent = "";
        let finalVerdict = "";
        let finalClass = "";

        issues.forEach(issue => {
            const data = ADVICE_DB[issue];
            htmlContent += `
                <div class="defect-warning">⚠️ ${data.title}</div>
                <ul class="action-list">${data.steps}</ul>
            `;
            finalVerdict = data.verdict;
            finalClass = data.verdictClass;
        });

        panel.innerHTML = `
            <div class="advice-body">${htmlContent}</div>
            <div class="verdict-box ${finalClass}">${finalVerdict}</div>
        `;
        
        currentDiagnosis = Array.from(issues).join(", ");
    }
}

// --- LOGGING ---
function logCurrentState() {
    const batchID = document.getElementById('batch-id').innerText;
    const location = document.getElementById('location-id').innerText.replace("📍 ", "");
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const tbody = document.getElementById('log-body');
    const video = document.getElementById('webcam');

    const canvas = document.createElement('canvas');
    canvas.width = 300; 
    canvas.height = 300;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, 300, 300); 
    const imgData = canvas.toDataURL('image/jpeg');

    auditHistory[batchID] = {
        time: time,
        location: location,
        img: imgData,
        status: currentDiagnosis
    };

    let badgeClass = currentDiagnosis === "Clean" ? "badge-pass" : "badge-fail";
    let statusText = currentDiagnosis === "Clean" ? "PASSED" : "FAILED";

    let buttonHTML = "";
    
    if (currentDiagnosis === "Clean") {
        buttonHTML = `<button class="btn-view-cert" onclick="window.recallEvidence('${batchID}')">📄 OPEN</button>`;
        window.recallEvidence(batchID); 
    } else {
        buttonHTML = `<div class="btn-view-fail">❌</div>`;
        document.getElementById('certificate-area').style.display = 'none';
    }

    const row = `
        <tr>
            <td>${buttonHTML}</td>
            <td>${time}</td>
            <td>${batchID}</td>
            <td><span class="log-badge ${badgeClass}">${statusText}</span></td>
        </tr>
    `;
    tbody.insertAdjacentHTML('afterbegin', row);

    if (currentDiagnosis === "Clean") {
        setTimeout(generateBatchID, 1000); 
    }
}
