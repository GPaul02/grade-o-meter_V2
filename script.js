const URL = "./"; // GitHub Pages Path
let model, webcam, maxPredictions;
let isScanning = false;

// --- VARIABLES ---
let totalScanned = 0;
let requiredApples = 20;
let defectCount = 0;

// --- GAP DETECTION STATE ---
// We start assuming we are looking at a gap (Table/Mat)
let isLookingAtGap = true; 

// --- AUDIT HISTORY STORE ---
let auditHistory = []; 

window.onload = function() {
    // Generate Random Batch ID on load
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

    // 2. Attach to HTML
    const container = document.getElementById("webcam-container");
    container.innerHTML = "";
    container.appendChild(webcam.canvas);
    
    // 3. Reset State
    isScanning = true;
    totalScanned = 0; 
    defectCount = 0;
    isLookingAtGap = true; // Reset gap logic

    document.getElementById("scan-status").innerText = "Find an apple...";
    
    // Generate new Batch ID
    document.getElementById('batch-id').innerText = "BATCH-" + Math.floor(Math.random() * 9000 + 1000);
    // Hide old certificate
    document.getElementById("certificate-area").style.display = "none";
}

async function loop() {
    webcam.update(); 
    if(isScanning) await predictGapLogic();
    window.requestAnimationFrame(loop);
}

// --- THE CORE: GAP DETECTION LOGIC ---
async function predictGapLogic() {
    const video = webcam.canvas;
    const cropCanvas = document.getElementById('crop-canvas');
    const ctx = cropCanvas.getContext('2d');
    
    const vW = video.width;
    const vH = video.height;
    const halfW = vW / 2;
    const halfH = vH / 2;

    // Define 4 Grid Zones
    const zones = [
        { id: 'box-0', x: 0,     y: 0 }, 
        { id: 'box-1', x: halfW, y: 0 }, 
        { id: 'box-2', x: 0,     y: halfH }, 
        { id: 'box-3', x: halfW, y: halfH } 
    ];

    let activeZones = 0; 
    let frameDefectFound = false;

    // 1. Analyze Each Zone
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
        
        // Threshold > 85% to confirm an object
        if (highestProb > 0.85 && bestClass !== "Background") {
            activeZones++;
            
            // Defect Check
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
            // Low confidence or Background = GAP
            boxDiv.className = "grid-box status-idle";
            boxDiv.innerText = "";
        }
    }

    // 2. THE LOGIC SWITCH (Anti-Mountain)
    if (activeZones === 0) {
        // We are looking at a table/gap
        isLookingAtGap = true;
        document.getElementById("scan-status").innerText = "Move to next...";
    } else {
        // We see an Apple (Active Zones > 0)
        if (isLookingAtGap === true && totalScanned < requiredApples) {
            // STATE CHANGE: We just moved from Gap -> Apple. COUNT IT!
            totalScanned++;
            isLookingAtGap = false; // Lock counting until we see a gap again
            
            if (frameDefectFound) defectCount++;
            
            // Feedback
            document.getElementById("scan-status").innerText = "Captured!";
            if (navigator.vibrate) navigator.vibrate(50);
        } else {
             // We are still looking at the SAME apple
             document.getElementById("scan-status").innerText = "Scanning...";
        }
    }

    // 3. Draw Ring UI
    drawHybridRing(totalScanned, requiredApples);

    // 4. Completion Check
    if (totalScanned >= requiredApples) {
        completeBatch();
    }
}

// --- VISUALS ---
function drawHybridRing(current, total) {
    const canvas = document.getElementById("overlay-canvas");
    const ctx = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;
    const cx = width / 2;
    const cy = height / 2;
    
    ctx.clearRect(0, 0, width, height);

    // Background Ring
    ctx.beginPath();
    ctx.arc(cx, cy, 60, 0, 2 * Math.PI);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
    ctx.lineWidth = 8;
    ctx.stroke();

    // Progress Ring (Green)
    const pct = current / total;
    const endAngle = (2 * Math.PI * pct) - 0.5 * Math.PI;
    
    ctx.beginPath();
    ctx.arc(cx, cy, 60, -0.5 * Math.PI, endAngle);
    ctx.strokeStyle = "#2ecc71";
    ctx.lineWidth = 8;
    ctx.lineCap = "round";
    ctx.stroke();

    // Text Center
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
    drawHybridRing(totalScanned, requiredApples);

    // Calculate Grade
    const defectRate = (defectCount / totalScanned) * 100;
    let grade = "GRADE A";
    if (defectRate > 5) grade = "GRADE B";
    if (defectRate > 15) grade = "PROCESSING";

    // Capture Evidence Photo
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

    // Generate QR
    new QRious({
        element: document.getElementById('sticker-qr'),
        value: `BATCH:${batchID}|GRADE:${grade}|DEFECT:${defectRate.toFixed(1)}%`,
        size: 90
    });

    // Save to Ledger
    updateLedger(batchID, timeStr, grade, imgData, defectRate.toFixed(1), totalScanned);
}

// --- LEDGER LOGIC ---
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
