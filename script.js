const URL = "./"; // GitHub Pages Path
let model, webcam, maxPredictions;
let isScanning = false;

// --- HYBRID VARIABLES ---
let totalScanned = 0;
let requiredApples = 20;
let defectCount = 0;
let isLookingAtGap = true; // Start assuming we are looking at a gap (Table)
let gapTimer = 0;

// --- INIT ---
window.onload = function() {
    // Generate a random Batch ID on load
    document.getElementById('batch-id').innerText = "BATCH-" + Math.floor(Math.random() * 9000 + 1000);
    // Start GPS immediately
    startGPS();
};

async function init() {
    const modelURL = URL + "model.json";
    const metadataURL = URL + "metadata.json";

    model = await tmImage.load(modelURL, metadataURL);
    maxPredictions = model.getTotalClasses();

    // --- CAMERA SETUP (FIXED FOR REAR CAM) ---
    const flip = false; // Must be FALSE for rear camera
    const width = 300; 
    const height = 300; 
    
    webcam = new tmImage.Webcam(width, height, flip); 
    
    // Explicitly request the "Environment" (Rear) Camera
    await webcam.setup({ facingMode: "environment" }); 
    
    await webcam.play();
    window.requestAnimationFrame(loop);

    // clear old canvas and append new one
    const container = document.getElementById("webcam-container");
    container.innerHTML = "";
    container.appendChild(webcam.canvas);
    
    isScanning = true;
    document.getElementById("scan-status").innerText = "Scan 20 Apples...";
}

async function loop() {
    webcam.update(); 
    if(isScanning) await predictHybrid();
    window.requestAnimationFrame(loop);
}

// --- THE HYBRID CORE ---
async function predictHybrid() {
    const video = webcam.canvas;
    const cropCanvas = document.getElementById('crop-canvas');
    const ctx = cropCanvas.getContext('2d');
    
    // 1. Define 4 Zones (Coordinates)
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

    let activeZones = 0; // How many boxes see an apple?
    let frameDefectFound = false;

    // 2. Loop Through 4 Grids (Visuals)
    for (let i = 0; i < zones.length; i++) {
        const zone = zones[i];
        
        // CROP the video to this zone
        ctx.drawImage(video, zone.x, zone.y, halfW, halfH, 0, 0, 150, 150);
        const prediction = await model.predict(cropCanvas);

        // Find Best Class
        let highestProb = 0;
        let bestClass = "";
        for (let j = 0; j < maxPredictions; j++) {
            if (prediction[j].probability > highestProb) {
                highestProb = prediction[j].probability;
                bestClass = prediction[j].className;
            }
        }

        // UPDATE GRID UI
        const boxDiv = document.getElementById(zone.id);
        
        // Threshold: Must be > 80% confident to be "Active"
        if (highestProb > 0.80) {
            activeZones++;
            
            // Check if class is Fresh (adjust string to match your TM model exactly)
            if (bestClass === "Fresh" || bestClass === "fresh_apple" || bestClass === "fresh") {
                boxDiv.className = "grid-box status-ok";
                boxDiv.innerText = "OK";
            } else {
                // It is a Defect (Scab/Rot)
                boxDiv.className = "grid-box status-bad";
                boxDiv.innerText = "DEFECT";
                frameDefectFound = true;
            }
        } else {
            // It is a Gap (Table/Mat)
            boxDiv.className = "grid-box status-idle";
            boxDiv.innerText = "";
        }
    }

    // 3. THE GAP COUNTER LOGIC
    // If NO zones are active, we are looking at a gap (Table).
    if (activeZones === 0) {
        isLookingAtGap = true;
        document.getElementById("scan-status").innerText = "Move to next...";
    } else {
        // We see apples!
        if (isLookingAtGap === true && totalScanned < requiredApples) {
            // STATE CHANGE: Gap -> Apple. COUNT IT!
            totalScanned++;
            isLookingAtGap = false; // Lock until next gap
            
            // If this specific frame had a defect, record it
            if (frameDefectFound) defectCount++;
            
            // Visual Feedback
            document.getElementById("scan-status").innerText = "Scanning...";
        }
    }

    // 4. Update Ring Visuals
    drawHybridRing(totalScanned, requiredApples);

    // 5. Completion Check
    if (totalScanned >= requiredApples) {
        completeBatch();
    }
}

// --- RING DRAWING ---
function drawHybridRing(current, total) {
    const canvas = document.getElementById("overlay-canvas");
    const ctx = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;
    const cx = width / 2;
    const cy = height / 2;
    
    ctx.clearRect(0, 0, width, height);

    // Draw Ring Background
    ctx.beginPath();
    ctx.arc(cx, cy, 60, 0, 2 * Math.PI);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
    ctx.lineWidth = 8;
    ctx.stroke();

    // Draw Progress
    const pct = current / total;
    const endAngle = (2 * Math.PI * pct) - 0.5 * Math.PI;
    
    ctx.beginPath();
    ctx.arc(cx, cy, 60, -0.5 * Math.PI, endAngle);
    ctx.strokeStyle = "#2ecc71";
    ctx.lineWidth = 8;
    ctx.lineCap = "round";
    ctx.stroke();

    // Draw Count Text
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
    
    // Calculate Grade
    const defectRate = (defectCount / totalScanned) * 100;
    let grade = "GRADE A";
    if (defectRate > 5) grade = "GRADE B";
    if (defectRate > 15) grade = "PROCESSING";

    document.getElementById("certificate-area").style.display = "block";
    document.getElementById("final-grade").innerText = grade;
    
    // Update Sticker Details
    const batchID = document.getElementById('batch-id').innerText;
    document.getElementById('cert-details').innerText = `DEFECTS: ${defectRate.toFixed(1)}% | QTY: ${totalScanned}`;

    // Generate QR
    new QRious({
        element: document.getElementById('sticker-qr'),
        value: `BATCH:${batchID}|GRADE:${grade}|DEFECT:${defectRate.toFixed(1)}%`,
        size: 80
    });
}

// --- GPS LOGIC (Simple) ---
function startGPS() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(position => {
            const lat = position.coords.latitude.toFixed(2);
            const lon = position.coords.longitude.toFixed(2);
            document.getElementById('location-id').innerText = `📍 Lat: ${lat}, Lon: ${lon}`;
        }, () => {
            document.getElementById('location-id').innerText = "🚫 Location Denied";
        });
    } else {
        document.getElementById('location-id').innerText = "⚠️ GPS Not Supported";
    }
}
