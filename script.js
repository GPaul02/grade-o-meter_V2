const URL = "./"; // GitHub Pages Path
let model, webcam, maxPredictions;
let isScanning = false;

// --- RHYTHM VARIABLES ---
let totalScanned = 0;
let requiredApples = 20;
let defectCount = 0;
let lastCountTime = 0; 
const SCAN_DELAY = 1200; // 1.2 Seconds per apple (Adjust for speed)

// --- AUDIT HISTORY ---
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

    // 1. Setup Webcam
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
    
    // 2. Reset State
    isScanning = true;
    totalScanned = 0; 
    defectCount = 0;
    lastCountTime = Date.now(); // Start the timer

    document.getElementById("scan-status").innerText = "Hold steady over crate...";
    
    document.getElementById('batch-id').innerText = "BATCH-" + Math.floor(Math.random() * 9000 + 1000);
    document.getElementById("certificate-area").style.display = "none";
}

async function loop() {
    webcam.update(); 
    if(isScanning) await predictRhythmLogic();
    window.requestAnimationFrame(loop);
}

// --- THE CORE: RHYTHM LOGIC (CRATE MODE) ---
async function predictRhythmLogic() {
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

    // 1. Analyze Zones
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
        
        // Threshold
        if (highestProb > 0.85 && bestClass !== "Background") {
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

    // 2. TIME-BASED COUNTING (For Crates)
    const now = Date.now();
    
    // If we see apples (Active Zones > 0) AND we haven't finished
    if (activeZones > 0 && totalScanned < requiredApples) {
        
        // Check if 1.2 seconds have passed since last count
        if (now - lastCountTime > SCAN_DELAY) {
            totalScanned++;
            lastCountTime = now; // Reset timer
            
            if (frameDefectFound) defectCount++;
            
            document.getElementById("scan-status").innerText = "Captured!";
            if (navigator.vibrate) navigator.vibrate(50);
        } else {
            // Show "Scanning..." while waiting for timer
            document.getElementById("scan-status").innerText = "Scanning...";
        }
    } else {
        // We see nothing (or finished)
        if (totalScanned < requiredApples) {
             document.getElementById("scan-status").innerText = "Point at apples...";
        }
    }

    // 3. Draw Pulse UI (Visual Timer)
    // Calculate how full the timer is (0.0 to 1.0)
    let pulseProgress = Math.min((now - lastCountTime) / SCAN_DELAY, 1);
    // If not seeing apples, reset pulse
    if(activeZones === 0) pulseProgress = 0;
    
    drawRhythmRing(totalScanned, requiredApples, pulseProgress);

    // 4. Finish
    if (totalScanned >= requiredApples) {
        completeBatch();
    }
}

// --- VISUALS ---
function drawRhythmRing(current, total, pulse) {
    const canvas = document.getElementById("overlay-canvas");
    const ctx = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;
    const cx = width / 2;
    const cy = height / 2;
    
    ctx.clearRect(0, 0, width, height);

    // Background
    ctx.beginPath();
    ctx.arc(cx, cy, 60, 0, 2 * Math.PI);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
    ctx.lineWidth = 8;
    ctx.stroke();

    // Main Progress (Green)
    const pct = current / total;
    const endAngle = (2 * Math.PI * pct) - 0.5 * Math.PI;
    ctx.beginPath();
    ctx.arc(cx, cy, 60, -0.5 * Math.PI, endAngle);
    ctx.strokeStyle = "#2ecc71";
    ctx.lineWidth = 8;
    ctx.lineCap = "round";
    ctx.stroke();
    
    // Pulse (The "Timer" Ring - White)
    if (current < total) {
        ctx.beginPath();
        // Inner ring radius 70
        const pulseAngle = (2 * Math.PI * pulse) - 0.5 * Math.PI;
        ctx.arc(cx, cy, 72, -0.5 * Math.PI, pulseAngle);
        ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
        ctx.lineWidth = 4;
        ctx.stroke();
    }

    // Text
    ctx.fillStyle = "white";
    ctx.font = "bold 24px Montserrat";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor="black";
    ctx.shadowBlur=4;
    ctx.fillText(`${current}/${total}`, cx, cy);
}

function completeBatch() {
    isScanning = false;
    document.getElementById("scan-status").innerText = "BATCH COMPLETE";
    // Draw full ring
    drawRhythmRing(totalScanned, requiredApples, 0);

    const defectRate = (defectCount / totalScanned) * 100;
    let grade = "GRADE A";
    if (defectRate > 5) grade = "GRADE B";
    if (defectRate > 15) grade = "PROCESSING";

    // Evidence
    const video = webcam.canvas;
    const evidenceCanvas = document.createElement("canvas");
    evidenceCanvas.width = video.width;
    evidenceCanvas.height = video.height;
    const ctx = evidenceCanvas.getContext("2d");
    ctx.drawImage(video, 0, 0); 
    const imgData = evidenceCanvas.toDataURL("image/jpeg");

    // Show Cert
    const certArea = document.getElementById("certificate-area");
    certArea.style.display = "block";
    certArea.scrollIntoView({behavior: "smooth"});
    
    const batchID = document.getElementById('batch-id').innerText;
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    document.querySelector(".sticker-grade").innerText = grade;
    const detailsText = `DEFECTS: ${defectRate.toFixed(1)}% | QTY: ${totalScanned}<br>${timeStr}`;
    document.getElementById('cert-details').innerHTML = `BATCH: ${batchID}<br>${detailsText}`;
    document.getElementById("large-proof").src = imgData;

    new QRious({
        element: document.getElementById('sticker-qr'),
        value: `BATCH:${batchID}|GRADE:${grade}|DEFECT:${defectRate.toFixed(1)}%`,
        size: 90
    });

    updateLedger(batchID, timeStr, grade, imgData, defectRate.toFixed(1), totalScanned);
}

// --- LEDGER ---
function updateLedger(batchID, time, grade, imgData, defectRate, totalScanned) {
    const record = {
        id: batchID,
        time: time,
        grade: grade,
        img: imgData,
        details: `DEFECTS: ${defectRate}% | QTY: ${totalScanned}`,
        status: grade === "PROCESSING" ? "FAILED" : "PASSED"
    };
    auditHistory.push(record);

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

window.loadPastRecord = function(targetID) {
    const record = auditHistory.find(r => r.id === targetID);
    if(!record) return;

    document.querySelector(".sticker-grade").innerText = record.grade;
    document.getElementById('cert-details').innerHTML = 
        `BATCH: ${record.id}<br>${record.details}<br>${record.time}`;
    document.getElementById("large-proof").src = record.img;
    
    const certArea = document.getElementById("certificate-area");
    certArea.style.display = "block";
    certArea.scrollIntoView({behavior: "smooth"});
    
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
