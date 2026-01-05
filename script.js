const URL = "./"; // GitHub Pages Path
let model, webcam, maxPredictions;
let isScanning = false;

// --- RHYTHM SCANNER VARIABLES ---
let totalScanned = 0;
let requiredApples = 20;
let defectCount = 0;
let lastCountTime = 0; 
const SCAN_DELAY = 1500; // 1.5 Seconds per apple

// --- AUDIT HISTORY STORE ---
let auditHistory = []; 

window.onload = function() {
    document.getElementById('batch-id').innerText = "BATCH-" + Math.floor(Math.random() * 9000 + 1000);
};

async function init() {
    startGPS();
    const modelURL = URL + "model.json";
    const metadataURL = URL + "metadata.json";

    model = await tmImage.load(modelURL, metadataURL);
    maxPredictions = model.getTotalClasses();

    const flip = false; 
    const width = 300; 
    const height = 300; 
    webcam = new tmImage.Webcam(width, height, flip); 
    await webcam.setup({ facingMode: "environment" }); 
    await webcam.play();
    window.requestAnimationFrame(loop);

    const container = document.getElementById("webcam-container");
    container.innerHTML = "";
    container.appendChild(webcam.canvas);
    
    isScanning = true;
    totalScanned = 0; 
    defectCount = 0;
    lastCountTime = Date.now(); 
    document.getElementById("scan-status").innerText = "Hold steady...";
    
    // Generate new Batch ID for the new scan
    document.getElementById('batch-id').innerText = "BATCH-" + Math.floor(Math.random() * 9000 + 1000);
    // Hide old certificate while scanning
    document.getElementById("certificate-area").style.display = "none";
}

async function loop() {
    webcam.update(); 
    if(isScanning) await predictRhythm();
    window.requestAnimationFrame(loop);
}

// --- THE RHYTHM CORE ---
async function predictRhythm() {
    const video = webcam.canvas;
    const cropCanvas = document.getElementById('crop-canvas');
    const ctx = cropCanvas.getContext('2d');
    
    const vW = video.width;
    const vH = video.height;
    const halfW = vW / 2;
    const halfH = vH / 2;

    const zones = [
        { id: 'box-0', x: 0,     y: 0 }, 
        { id: 'box-1', x: halfW, y: 0 }, 
        { id: 'box-2', x: 0,     y: halfH }, 
        { id: 'box-3', x: halfW, y: halfH } 
    ];

    let activeZones = 0; 
    let frameDefectFound = false;

    // 1. Loop Through 4 Grids
    for (let i = 0; i < zones.length; i++) {
        const zone = zones[i];
        ctx.drawImage(video, zone.x, zone.y, halfW, halfH, 0, 0, 150, 150);
        const prediction = await model.predict(cropCanvas);

        let highestProb = 0;
        let bestClass = "";
        for (let j = 0; j < maxPredictions; j++) {
            if (prediction[j].probability > highestProb) {
                highestProb = prediction[j].probability;
                bestClass = prediction[j].className;
            }
        }

        const boxDiv = document.getElementById(zone.id);
        
        if (highestProb > 0.90) {
            activeZones++;
            const lowerClass = bestClass.toLowerCase();
            if (lowerClass.includes("rot") || lowerClass.includes("scab") || lowerClass.includes("defect")) {
                boxDiv.className = "grid-box status-bad";
                boxDiv.innerText = "DEFECT";
                frameDefectFound = true;
            } else {
                boxDiv.className = "grid-box status-ok";
                boxDiv.innerText = "OK";
            }
        } else {
            boxDiv.className = "grid-box status-idle";
            boxDiv.innerText = "";
        }
    }

    // 2. THE RHYTHM TIMER
    const now = Date.now();
    const timeSinceLast = now - lastCountTime;

    if (activeZones > 0 && totalScanned < requiredApples) {
        if (timeSinceLast > SCAN_DELAY) {
            totalScanned++; 
            lastCountTime = now; 
            if (frameDefectFound) defectCount++;
            document.getElementById("scan-status").innerText = "Captured! Keep moving...";
            if (navigator.vibrate) navigator.vibrate(50);
        } else {
             document.getElementById("scan-status").innerText = "Scanning...";
        }
        let progress = Math.min((Date.now() - lastCountTime) / SCAN_DELAY, 1);
        updateRingPulse(progress, totalScanned, requiredApples);
    } else {
        drawHybridRing(totalScanned, requiredApples, 0); 
        document.getElementById("scan-status").innerText = "Point at apples...";
    }

    // 3. Completion Check
    if (totalScanned >= requiredApples) {
        completeBatch();
    }
}

// --- VISUALS ---
function updateRingPulse(pulsePct, current, total) {
    const canvas = document.getElementById("overlay-canvas");
    const ctx = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;
    const cx = width / 2;
    const cy = height / 2;
    
    ctx.clearRect(0, 0, width, height);

    ctx.beginPath();
    ctx.arc(cx, cy, 60, 0, 2 * Math.PI);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
    ctx.lineWidth = 8;
    ctx.stroke();

    const totalPct = current / total;
    const endAngle = (2 * Math.PI * totalPct) - 0.5 * Math.PI;
    
    ctx.beginPath();
    ctx.arc(cx, cy, 60, -0.5 * Math.PI, endAngle);
    ctx.strokeStyle = "#2ecc71";
    ctx.lineWidth = 8;
    ctx.lineCap = "round";
    ctx.stroke();

    if (pulsePct > 0 && current < total) {
        ctx.beginPath();
        ctx.arc(cx, cy, 72, -0.5 * Math.PI, (2 * Math.PI * pulsePct) - 0.5 * Math.PI);
        ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
        ctx.lineWidth = 4;
        ctx.stroke();
    }

    ctx.fillStyle = "white";
    ctx.font = "bold 24px Montserrat";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor="black";
    ctx.shadowBlur=4;
    ctx.fillText(`${current}/${total}`, cx, cy);
}

function drawHybridRing(current, total, pulse) {
    updateRingPulse(pulse, current, total);
}

function completeBatch() {
    isScanning = false;
    document.getElementById("scan-status").innerText = "BATCH COMPLETE";
    drawHybridRing(totalScanned, requiredApples, 0);

    const defectRate = (defectCount / totalScanned) * 100;
    let grade = "GRADE A";
    if (defectRate > 5) grade = "GRADE B";
    if (defectRate > 15) grade = "PROCESSING";

    // Capture Photo
    const video = webcam.canvas;
    const evidenceCanvas = document.createElement("canvas");
    evidenceCanvas.width = video.width;
    evidenceCanvas.height = video.height;
    const ctx = evidenceCanvas.getContext("2d");
    ctx.drawImage(video, 0, 0); 
    const imgData = evidenceCanvas.toDataURL("image/jpeg");

    // Display Certificate
    const certArea = document.getElementById("certificate-area");
    certArea.style.display = "block";
    certArea.scrollIntoView({behavior: "smooth"});
    
    const batchID = document.getElementById('batch-id').innerText;
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // Update Sticker UI
    document.querySelector(".sticker-grade").innerText = grade;
    const detailsText = `DEFECTS: ${defectRate.toFixed(1)}% | QTY: ${totalScanned}<br>${timeStr}`;
    document.getElementById('cert-details').innerHTML = `BATCH: ${batchID}<br>${detailsText}`;
    document.getElementById("large-proof").src = imgData;

    new QRious({
        element: document.getElementById('sticker-qr'),
        value: `BATCH:${batchID}|GRADE:${grade}|DEFECT:${defectRate.toFixed(1)}%`,
        size: 90
    });

    // --- UPDATE LEDGER ---
    updateLedger(batchID, timeStr, grade, imgData, defectRate.toFixed(1), totalScanned);
}

// --- LEDGER LOGIC ---
function updateLedger(batchID, time, grade, imgData, defectRate, totalScanned) {
    // 1. Save to History
    const record = {
        id: batchID,
        time: time,
        grade: grade,
        img: imgData,
        details: `DEFECTS: ${defectRate}% | QTY: ${totalScanned}`,
        status: grade === "PROCESSING" ? "FAILED" : "PASSED"
    };
    auditHistory.push(record);

    // 2. Add Row to Table
    const tbody = document.getElementById('log-body');
    const row = document.createElement('tr');
    const badgeClass = record.status === "PASSED" ? "badge-pass" : "badge-fail";
    
    row.innerHTML = `
        <td><button class="btn-view-cert" onclick="loadPastRecord('${batchID}')">📄 OPEN</button></td>
        <td>${time}</td>
        <td>${batchID}</td>
        <td><span class="log-badge ${badgeClass}">${record.status}</span></td>
    `;
    tbody.prepend(row);
}

// Function to recall old data
window.loadPastRecord = function(targetID) {
    const record = auditHistory.find(r => r.id === targetID);
    if(!record) return;

    // Repopulate Certificate
    document.querySelector(".sticker-grade").innerText = record.grade;
    document.getElementById('cert-details').innerHTML = 
        `BATCH: ${record.id}<br>${record.details}<br>${record.time}`;
    document.getElementById("large-proof").src = record.img;
    
    // Show Area
    const certArea = document.getElementById("certificate-area");
    certArea.style.display = "block";
    certArea.scrollIntoView({behavior: "smooth"});
    
    // Regen QR
     new QRious({
        element: document.getElementById('sticker-qr'),
        value: `BATCH:${record.id}|GRADE:${record.grade}`,
        size: 90
    });
}

function startGPS() {
    document.getElementById('location-id').innerText = "📡 Locating...";
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(position => {
            const lat = position.coords.latitude.toFixed(4);
            const lon = position.coords.longitude.toFixed(4);
            document.getElementById('location-id').innerText = `📍 ${lat}, ${lon}`;
        }, (error) => {
            document.getElementById('location-id').innerText = "🚫 Location Denied";
        }, { enableHighAccuracy: true, timeout: 5000 });
    } else {
        document.getElementById('location-id').innerText = "⚠️ GPS Not Supported";
    }
}
