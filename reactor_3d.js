// 3D Reactor Simulation Engine for AtomicCore
// Handles Cinematic 3D Physics for Chemical Reactions and Radioactive Containment

class ReactorEngine {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) {
            console.error("ReactorEngine: Canvas not found.");
            return;
        }

        // Scene setup
        this.scene = new THREE.Scene();
        
        // Camera setup
        this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(0, 0, 50);
        
        // Renderer setup
        this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        
        // Post-processing setup (Bloom)
        this.composer = new THREE.EffectComposer(this.renderer);
        this.composer.addPass(new THREE.RenderPass(this.scene, this.camera));
        
        const bloomPass = new THREE.UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
        bloomPass.threshold = 0.2;
        bloomPass.strength = 1.2;
        bloomPass.radius = 0.5;
        this.composer.addPass(bloomPass);

        // Lights
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
        this.scene.add(ambientLight);
        
        this.pointLight = new THREE.PointLight(0xffffff, 1, 100);
        this.pointLight.position.set(0, 0, 10);
        this.scene.add(this.pointLight);

        // Setup OrbitControls
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.maxDistance = 100;
        this.controls.minDistance = 5;

        // Core variables
        this.atoms = [];
        this.particles = [];
        this.bonds = [];
        this.isAnimating = false;
        this.containmentBox = null;
        this.clock = new THREE.Clock();

        // Raycasting for Interactivity
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        
        window.addEventListener('click', this.onMouseClick.bind(this));

        // Audio Context setup
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();

        window.addEventListener('resize', this.onWindowResize.bind(this));
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.composer.setSize(window.innerWidth, window.innerHeight);
    }

    onMouseClick(event) {
        if(!this.isAnimating) return;
        this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
        
        this.raycaster.setFromCamera(this.mouse, this.camera);
        
        const intersects = this.raycaster.intersectObjects(this.bonds);
        if(intersects.length > 0) {
            const bond = intersects[0].object;
            if (bond.userData && bond.userData.infoHtml) {
                this.showAdvancedBondInfo(bond.userData.infoHtml);
            }
        }
    }

    showAdvancedBondInfo(htmlContent) {
        let panel = document.getElementById('advanced-info-panel');
        if(!panel) {
            panel = document.createElement('div');
            panel.id = 'advanced-info-panel';
            panel.style.position = 'absolute';
            panel.style.top = '50%';
            panel.style.left = '50%';
            panel.style.transform = 'translate(-50%, -50%)';
            panel.style.width = '400px';
            panel.style.background = 'rgba(0, 15, 30, 0.9)';
            panel.style.border = '1px solid #00e5ff';
            panel.style.boxShadow = '0 0 20px rgba(0, 229, 255, 0.5)';
            panel.style.color = '#fff';
            panel.style.padding = '20px';
            panel.style.fontFamily = "'Share Tech Mono', monospace";
            panel.style.zIndex = '10000';
            
            const closeBtn = document.createElement('button');
            closeBtn.innerText = "X";
            closeBtn.style.position = 'absolute';
            closeBtn.style.top = '10px';
            closeBtn.style.right = '10px';
            closeBtn.style.background = 'transparent';
            closeBtn.style.color = '#ff4444';
            closeBtn.style.border = 'none';
            closeBtn.style.cursor = 'pointer';
            closeBtn.style.fontSize = '20px';
            closeBtn.onclick = () => panel.style.display = 'none';
            
            panel.appendChild(closeBtn);
            
            const content = document.createElement('div');
            content.id = 'advanced-info-content';
            panel.appendChild(content);
            
            document.getElementById('three-container').appendChild(panel);
        }
        
        document.getElementById('advanced-info-content').innerHTML = htmlContent;
        panel.style.display = 'block';
    }

    createAudioOscillator(type, freq, duration, vol=0.5) {
        if(this.audioCtx.state === 'suspended') this.audioCtx.resume();
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.audioCtx.currentTime);
        
        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        
        gain.gain.setValueAtTime(vol, this.audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + duration);
        
        osc.start();
        osc.stop(this.audioCtx.currentTime + duration);
    }

    playSiren() {
        if(this.audioCtx.state === 'suspended') this.audioCtx.resume();
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.type = 'sawtooth';
        
        // Siren sweep
        osc.frequency.setValueAtTime(400, this.audioCtx.currentTime);
        osc.frequency.linearRampToValueAtTime(800, this.audioCtx.currentTime + 0.5);
        osc.frequency.linearRampToValueAtTime(400, this.audioCtx.currentTime + 1.0);
        
        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        gain.gain.setValueAtTime(0.1, this.audioCtx.currentTime);
        
        osc.start();
        osc.stop(this.audioCtx.currentTime + 1.0);
    }

    playExplosion() {
        this.createAudioOscillator('square', 100, 2.0, 1.0);
        setTimeout(() => this.createAudioOscillator('sawtooth', 50, 2.0, 1.0), 100);
        // Noise burst approximation
        for(let i=0; i<10; i++){
            setTimeout(() => this.createAudioOscillator('square', Math.random()*200, 0.5, 0.5), i*50);
        }
    }

    clearScene() {
        while(this.scene.children.length > 0){ 
            const obj = this.scene.children[0];
            this.scene.remove(obj); 
        }
        this.atoms = [];
        this.bonds = [];
        this.particles = [];
        if(this.explosionLoopId) {
            clearInterval(this.explosionLoopId);
            this.explosionLoopId = null;
        }
        
        // Hide popup if open
        const modal = document.getElementById('reaction-popup-modal');
        if(modal) modal.style.display = 'none';

        // Re-add lights and stars
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
        this.scene.add(ambientLight);
        this.scene.add(this.pointLight);
        if(this.stars) this.scene.add(this.stars);
    }

    createSimpleAtom(color, size) {
        const group = new THREE.Group();
        group.userData = { valenceElectrons: [], coreRings: [] };
        
        // Nucleus
        const geo = new THREE.SphereGeometry(size, 32, 32);
        const mat = new THREE.MeshStandardMaterial({ 
            color: color, 
            emissive: color,
            emissiveIntensity: 0.5,
            roughness: 0.2 
        });
        const nucleus = new THREE.Mesh(geo, mat);
        group.add(nucleus);

        // Core orbitals (non-valence)
        const ringGeo = new THREE.TorusGeometry(size * 2, 0.05, 16, 100);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.3 });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = Math.PI/2;
        group.add(ring);
        group.userData.coreRings.push(ring);

        // Valence electrons (can be manipulated)
        // Creating 4 valence slots by default for visual representation
        for(let i=0; i<4; i++) {
            const eGeo = new THREE.SphereGeometry(0.3, 16, 16);
            const eMat = new THREE.MeshBasicMaterial({ color: 0x3388ff });
            const electron = new THREE.Mesh(eGeo, eMat);
            
            const angle = (i / 4) * Math.PI * 2;
            electron.position.set(Math.cos(angle) * size * 3.5, Math.sin(angle) * size * 3.5, 0);
            
            const glowGeo = new THREE.SphereGeometry(0.5, 16, 16);
            const glowMat = new THREE.MeshBasicMaterial({ color: 0x3388ff, transparent: true, opacity: 0.4 });
            const glow = new THREE.Mesh(glowGeo, glowMat);
            electron.add(glow);

            group.add(electron);
            group.userData.valenceElectrons.push({ mesh: electron, originalAngle: angle, radius: size * 3.5 });
        }

        return group;
    }

    startSimulation(totals, reactionType, resultData = []) {
        this.clearScene();
        this.isAnimating = true;
        this.camera.position.set(0, 0, 50);
        
        document.getElementById('three-container').style.opacity = '1';
        document.getElementById('three-container').style.pointerEvents = 'auto';

        if(totals['U']) {
            this.runRadioactiveDecay();
        } else if (reactionType === 'success') {
            this.runChemicalReaction(totals, resultData);
        } else if (reactionType === 'explode') {
            this.runExplosiveReaction(totals, resultData);
        } else {
            this.runNoReaction(totals);
        }

        this.animate();
    }

    runChemicalReaction(totals, resultData) {
        let meta = resultData[0];
        if(!meta.bondType) {
            // Fallback for missing metadata
            meta = { bondType: 'covalent', bondOrder: 1, geometry: 'linear', vbtDesc: 'Bonds formed.' };
        }

        if(meta.bondType === 'ionic') {
            this.runIonicBond(totals, meta);
        } else if(meta.bondType === 'coordinate') {
            this.runCoordinateBond(totals, meta);
        } else {
            this.runCovalentBond(totals, meta);
        }
    }

    drawBond(mesh1, mesh2, meta, bIndex=0, isCoordinate=false) {
        let color = isCoordinate ? 0xff00ff : 0x00e5ff;
        const material = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.8 });
        const distance = mesh1.position.distanceTo(mesh2.position);
        
        // Use a thicker cylinder for coordinate bonds
        const radius = isCoordinate ? 0.3 : 0.15;
        const geometry = new THREE.CylinderGeometry(radius, isCoordinate ? 0.1 : radius, distance, 16);
        const cylinder = new THREE.Mesh(geometry, material);
        
        const midPoint = new THREE.Vector3().addVectors(mesh1.position, mesh2.position).multiplyScalar(0.5);
        cylinder.position.copy(midPoint);
        
        // Orient cylinder from mesh1 to mesh2
        const direction = new THREE.Vector3().subVectors(mesh2.position, mesh1.position).normalize();
        cylinder.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
        
        if (meta.bondOrder > 1 && !isCoordinate) {
            const offset = (bIndex * 0.6) - ((meta.bondOrder-1)*0.3);
            cylinder.translateX(offset);
        }
        
        cylinder.userData = { infoHtml: this.generateInfoHtml(meta) };
        this.scene.add(cylinder);
        this.bonds.push(cylinder);
        return cylinder;
    }

    applyVSEPRGeometry(meta) {
        // Identify central atom (usually the one we only have 1 of, e.g. O in H2O, C in CH4)
        // Sort atoms so the one with the largest size (usually central) is first.
        let sorted = [...this.atoms].sort((a, b) => b.mesh.geometry.parameters.radius - a.mesh.geometry.parameters.radius);
        
        if (meta.geometry === 'bent' && sorted.length >= 3) {
            sorted[0].target = new THREE.Vector3(0, 0.5, 0); // Central (O)
            sorted[1].target = new THREE.Vector3(-1.5, -1, 0); // H
            sorted[2].target = new THREE.Vector3(1.5, -1, 0); // H
        } else if (meta.geometry === 'tetrahedral' && sorted.length >= 5) {
            sorted[0].target = new THREE.Vector3(0, 0, 0); // Central (C)
            sorted[1].target = new THREE.Vector3(0, 2, 0);
            sorted[2].target = new THREE.Vector3(0, -0.66, 1.88);
            sorted[3].target = new THREE.Vector3(-1.63, -0.66, -0.94);
            sorted[4].target = new THREE.Vector3(1.63, -0.66, -0.94);
        } else if (meta.geometry === 'trigonal pyramidal' && sorted.length >= 4) {
            sorted[0].target = new THREE.Vector3(0, 0.5, 0); // Central (N)
            sorted[1].target = new THREE.Vector3(0, -1, 1.73);
            sorted[2].target = new THREE.Vector3(-1.5, -1, -0.86);
            sorted[3].target = new THREE.Vector3(1.5, -1, -0.86);
        } else {
            // Default to linear
            sorted.forEach((a, index) => {
                a.target = new THREE.Vector3(index * 3 - (sorted.length * 1.5) + 1.5, 0, 0);
            });
        }
        return sorted;
    }

    createAtomSet(totals) {
        const elements = Object.keys(totals);
        let atomMeshes = [];
        
        elements.forEach(sym => {
            for(let i=0; i<totals[sym]; i++) {
                let color = 0x00e5ff;
                if(sym === 'O') color = 0xff0000;
                if(sym === 'H') color = 0xffffff;
                if(sym === 'C') color = 0x444444;
                if(sym === 'N') color = 0x0000ff;
                if(sym === 'Na') color = 0xffa500;
                if(sym === 'Cl') color = 0x00ff00;
                if(sym === 'Mg') color = 0xc0c0c0;
                
                let size = 1.0;
                if(sym === 'H') size = 0.5;
                if(sym === 'O' || sym === 'N' || sym === 'C') size = 1.2;
                if(sym === 'Na' || sym === 'Mg') size = 1.5;
                if(sym === 'Cl') size = 1.4;
                
                let atom = this.createSimpleAtom(color, size);
                
                // Spawn far away randomly for a cinematic "fly in"
                const startX = (Math.random() - 0.5) * 150;
                const startY = (Math.random() - 0.5) * 150;
                const startZ = (Math.random() - 0.5) * 150;
                atom.position.set(startX, startY, startZ);
                this.scene.add(atom);
                atomMeshes.push(atom);
                
                // Initially drift slowly before locking into geometry
                this.atoms.push({ mesh: atom, target: new THREE.Vector3(startX * 0.1, startY * 0.1, startZ * 0.1), speed: 0.03 });
            }
        });
        return atomMeshes;
    }

    generateInfoHtml(meta) {
        return `
            <h3 style="color:#00e5ff; margin-top:0;">Advanced Bond Information</h3>
            <p><strong>Bond Type:</strong> ${meta.bondType.toUpperCase()}</p>
            <p><strong>Bond Order:</strong> ${meta.bondOrder}</p>
            <p><strong>Geometry:</strong> ${meta.geometry}</p>
            <p><strong>Bond Angle:</strong> ${meta.bondAngle}</p>
            <p><strong>Hybridization:</strong> ${meta.hybridization}</p>
            <p><strong>Polarity:</strong> ${meta.polarity}</p>
            <hr style="border: 1px solid #444;">
            <p><strong>σ Bonds:</strong> ${meta.sigmaBonds} | <strong>π Bonds:</strong> ${meta.piBonds}</p>
            <p style="color:#aaaaaa; font-size:14px;"><strong>VBT Analysis:</strong><br>${meta.vbtDesc}</p>
        `;
    }

    runIonicBond(totals, meta) {
        const atomMeshes = this.createAtomSet(totals);
        this.showOverlayText("Approaching...", "00e5ff");

        // Approach
        setTimeout(() => {
            this.atoms.forEach((a, index) => {
                a.target = new THREE.Vector3(index * 4 - (this.atoms.length * 2), 0, 0);
            });
            this.createAudioOscillator('sine', 400, 1.0);
        }, 1000);

        // Electron Transfer
        setTimeout(() => {
            this.showOverlayText("Electron Transfer (Ionic)", "ffff00");
            if(atomMeshes.length >= 2) {
                // Animate donor electron flying to acceptor
                const donor = atomMeshes[0];
                const acceptor = atomMeshes[1];
                if(donor.userData.valenceElectrons.length > 0) {
                    const eData = donor.userData.valenceElectrons.pop();
                    const electron = eData.mesh;
                    donor.remove(electron);
                    acceptor.add(electron);
                    electron.position.set(0,0,0);
                    
                    // Flash charges
                    this.createAudioOscillator('square', 800, 0.2);
                }
            }
        }, 3000);

        // Attraction & Stabilization
        setTimeout(() => {
            this.showOverlayText("", "00ff00", false, false); // Clear text
            this.createAudioOscillator('triangle', 600, 1.0, 0.8);
            
            // Snap together closely
            this.atoms.forEach((a, index) => {
                a.target = new THREE.Vector3(index * 2 - (this.atoms.length * 1), 0, 0);
                a.speed = 0.1;
            });
            
            // Add clickable bond zone
            const zoneGeo = new THREE.BoxGeometry(4, 4, 4);
            const zoneMat = new THREE.MeshBasicMaterial({ visible: false });
            const zone = new THREE.Mesh(zoneGeo, zoneMat);
            zone.position.set(0,0,0);
            zone.userData = { infoHtml: this.generateInfoHtml(meta) };
            this.scene.add(zone);
            this.bonds.push(zone);

            setTimeout(() => { 
                this.atoms.forEach(a => { a.isMolecule = true; }); 
                
                // Show Popup
                const eq = this.buildEquationString(totals, [meta]);
                this.showPopupModal(eq, meta.name, meta.desc, false);
            }, 1000);
        }, 5000);
    }

    runCovalentBond(totals, meta) {
        const atomMeshes = this.createAtomSet(totals);
        this.showOverlayText("Orbital Overlap...", "00e5ff");

        let sortedAtoms = [];
        setTimeout(() => {
            sortedAtoms = this.applyVSEPRGeometry(meta);
            this.createAudioOscillator('sine', 600, 1.0);
        }, 1000);

        setTimeout(() => {
            this.showOverlayText("", "00ff00", false, false); // Clear overlay text
            this.createParticleExplosion(0, 0, 0, 0x00ff00, 50);
            this.createAudioOscillator('triangle', 800, 0.5, 0.8);

            // Draw bonds from central atom (index 0) to all other atoms
            if(sortedAtoms.length > 1) {
                for(let i=1; i<sortedAtoms.length; i++) {
                    for(let b=0; b<meta.bondOrder; b++) {
                        this.drawBond(sortedAtoms[0].mesh, sortedAtoms[i].mesh, meta, b, false);
                    }
                }
            }
        }, 3000);

        setTimeout(() => { 
            this.atoms.forEach(a => { a.isMolecule = true; }); 
            const eq = this.buildEquationString(totals, [meta]);
            this.showPopupModal(eq, meta.name, meta.desc, false);
        }, 4000);
    }

    runCoordinateBond(totals, meta) {
        const atomMeshes = this.createAtomSet(totals);
        this.showOverlayText("Coordinate (Dative) Bond Formation...", "00e5ff");

        let sortedAtoms = [];
        setTimeout(() => {
            sortedAtoms = this.applyVSEPRGeometry(meta);
            this.createAudioOscillator('sine', 500, 1.0);
        }, 1000);

        setTimeout(() => {
            this.showOverlayText("", "00ff00", false, false); // Clear text
            this.createParticleExplosion(0, 0, 0, 0x00ff00, 50);
            this.createAudioOscillator('triangle', 800, 0.5, 0.8);

            if(sortedAtoms.length > 1) {
                for(let i=1; i<sortedAtoms.length; i++) {
                    // Draw one coordinate bond
                    this.drawBond(sortedAtoms[i].mesh, sortedAtoms[0].mesh, meta, 0, true);
                    
                    // If it's CO, also add the regular 2 covalent bonds
                    if(meta.bondOrder === 3) {
                        for(let b=0; b<2; b++) {
                            // Pass offset index for standard covalent
                            this.drawBond(sortedAtoms[0].mesh, sortedAtoms[i].mesh, meta, b === 0 ? 1 : -1, false);
                        }
                    }
                }
            }
        }, 3000);

        setTimeout(() => { 
            this.atoms.forEach(a => { a.isMolecule = true; }); 
            const eq = this.buildEquationString(totals, [meta]);
            this.showPopupModal(eq, meta.name, meta.desc, false);
        }, 4000);
    }

    runExplosiveReaction(totals, resultData) {
        const atomMeshes = this.createAtomSet(totals);

        const runSequence = () => {
            this.showOverlayText("Reaction Initiated...", "ffaa00");

            // Sequence: Move together
            setTimeout(() => {
                this.atoms.forEach((a, index) => {
                    a.target = new THREE.Vector3(index * 3 - (this.atoms.length * 1.5), 0, 0);
                    a.speed = 0.05;
                });
                this.createAudioOscillator('sine', 600, 1.0);
            }, 1500);

            // Explode
            setTimeout(() => {
                this.showOverlayText("", "ff0000", false, false);
                this.playExplosion();
                this.createParticleExplosion(0, 0, 0, 0xff0000, 300, 2.0);
                this.screenShake = 3.0;

                // Scatter atoms rapidly
                this.atoms.forEach(a => {
                    a.target = new THREE.Vector3((Math.random()-0.5)*100, (Math.random()-0.5)*100, (Math.random()-0.5)*100);
                    a.speed = 0.2;
                });
            }, 3000);

            // Reform in a line (for the loop)
            setTimeout(() => {
                this.atoms.forEach((a, index) => {
                    a.target = new THREE.Vector3(index * 6 - (this.atoms.length * 3), 0, 0);
                    a.speed = 0.05; // Smooth slow return
                });
                
                // Show Danger Popup only on first explosion
                if(!this.explosionModalShown) {
                    this.explosionModalShown = true;
                    const eq = this.buildEquationString(totals, resultData);
                    let title = "VOLATILE EXPLOSION";
                    let desc = "The reactants were highly unstable and violently combusted upon bonding!";
                    if (resultData && resultData.length > 0) {
                        title = resultData[0].name;
                        desc = resultData[0].desc;
                    }
                    this.showPopupModal(eq, title, desc, true);
                }
            }, 4500);
        };

        this.explosionModalShown = false;
        // Run immediately, then repeat every 15 seconds
        runSequence();
        this.explosionLoopId = setInterval(runSequence, 15000);
    }

    runNoReaction(totals) {
        this.showOverlayText("No chemical reaction occurs under normal conditions.", "aaaaaa");
        
        const elements = Object.keys(totals);
        let startX = -20;
        
        elements.forEach(sym => {
            for(let i=0; i<totals[sym]; i++) {
                let atom = this.createSimpleAtom(Math.random() * 0xffffff, 1.0);
                atom.position.set(startX, Math.random() * 10 - 5, Math.random() * 10 - 5);
                this.scene.add(atom);
                
                // Random drifting target
                this.atoms.push({ 
                    mesh: atom, 
                    target: new THREE.Vector3(Math.random()*40-20, Math.random()*40-20, Math.random()*40-20), 
                    speed: 0.01 
                });
                startX += 10;
            }
        });
    }

    runRadioactiveDecay() {
        this.showOverlayText("Radioactive decay detected.", "ffaa00");
        this.createAudioOscillator('square', 200, 1.0);

        // Spawn Uranium
        const uranium = this.createSimpleAtom(0x00ff00, 2.0); // Bright radioactive green
        this.scene.add(uranium);
        this.atoms.push({ mesh: uranium, target: new THREE.Vector3(0, 0, 0), speed: 0.1 });

        // Phase 1: Glowing and Alpha Emission
        setTimeout(() => {
            this.showOverlayText("Alpha Particle Emission", "ff0000");
            const alpha = this.createSimpleAtom(0xffffff, 0.5);
            alpha.position.set(0, 0, 0);
            this.scene.add(alpha);
            this.atoms.push({ mesh: alpha, target: new THREE.Vector3(30, 20, 0), speed: 0.08 });
            
            // Shake uranium
            uranium.scale.set(1.2, 1.2, 1.2);
            this.createAudioOscillator('sawtooth', 300, 0.5);
        }, 3000);

        // Phase 2: Containment Chamber Appears
        setTimeout(() => {
            this.showOverlayText("Deploying Containment Chamber...", "00e5ff");
            
            const boxGeo = new THREE.BoxGeometry(15, 15, 15);
            const boxMat = new THREE.MeshPhysicalMaterial({ 
                color: 0x88ccff, 
                transmission: 0.9, 
                opacity: 1, 
                transparent: true,
                roughness: 0.1,
                metalness: 0.1,
                side: THREE.DoubleSide
            });
            this.containmentBox = new THREE.Mesh(boxGeo, boxMat);
            this.scene.add(this.containmentBox);
            
            // Pull camera back
            this.cameraTargetZ = 80;
        }, 5000);

        // Phase 3: Radiation Builds (Alarms)
        let alarmInterval;
        setTimeout(() => {
            this.showOverlayText("Radiation Levels Critical!", "ff0000");
            this.pointLight.color.setHex(0xff0000);
            
            alarmInterval = setInterval(() => {
                this.playSiren();
                this.pointLight.intensity = this.pointLight.intensity === 1 ? 5 : 1; // Flashing red
            }, 1000);
            
            // Cracking effect (simulate by drawing lines or changing material)
            const wireMat = new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true, transparent: true, opacity: 0.5 });
            const crackBox = new THREE.Mesh(new THREE.BoxGeometry(15.1, 15.1, 15.1), wireMat);
            this.containmentBox.add(crackBox);

        }, 8000);

        // Phase 4: Containment Failure
        setTimeout(() => {
            clearInterval(alarmInterval);
            this.showOverlayText("CONTAINMENT FAILURE!", "ff0000", true);
            this.playExplosion();
            
            // Remove box
            if(this.containmentBox) {
                this.scene.remove(this.containmentBox);
            }
            
            // Add shockwave
            const ringGeo = new THREE.RingGeometry(1, 2, 32);
            const ringMat = new THREE.MeshBasicMaterial({ color: 0xff0000, side: THREE.DoubleSide, transparent: true, opacity: 1.0 });
            this.shockwave = new THREE.Mesh(ringGeo, ringMat);
            this.scene.add(this.shockwave);

            // Add Debris Particles
            this.createParticleExplosion(0, 0, 0, 0xffaa00, 500, 2.0);
            this.createParticleExplosion(0, 0, 0, 0x00ff00, 200, 1.5);
            
            // Screen shake
            this.screenShake = 5.0;

            this.pointLight.intensity = 10;
            
            // Show Popup
            setTimeout(() => {
                document.getElementById('radioactive-overlay').style.display = 'none';
                this.showPopupModal("U ➔ Th + α", "Alpha Decay", "The Uranium nucleus was unstable and spontaneously emitted an alpha particle, transmuting into Thorium.", true);
            }, 1000);
        }, 12000);
    }

    createParticleExplosion(x, y, z, colorHex, count, speedMult=1.0) {
        const geo = new THREE.BufferGeometry();
        const pos = new Float32Array(count * 3);
        const vels = [];
        
        for(let i=0; i<count; i++) {
            pos[i*3] = x;
            pos[i*3+1] = y;
            pos[i*3+2] = z;
            
            vels.push({
                x: (Math.random() - 0.5) * speedMult,
                y: (Math.random() - 0.5) * speedMult,
                z: (Math.random() - 0.5) * speedMult
            });
        }
        
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        const mat = new THREE.PointsMaterial({ color: colorHex, size: 0.5, transparent: true, opacity: 1.0 });
        const points = new THREE.Points(geo, mat);
        points.userData.vels = vels;
        this.scene.add(points);
        this.particles.push(points);
    }

    showPopupModal(equation, title, details, isDanger=false) {
        const modal = document.getElementById('reaction-popup-modal');
        if(!modal) return;
        
        document.getElementById('popup-equation').innerHTML = equation;
        document.getElementById('popup-result-name').innerHTML = title;
        document.getElementById('popup-details').innerHTML = details;
        
        if (isDanger) {
            modal.classList.add('danger');
            document.getElementById('popup-equation').classList.add('popup-danger-equation');
            document.getElementById('popup-btn-keep').classList.add('danger-btn');
        } else {
            modal.classList.remove('danger');
            document.getElementById('popup-equation').classList.remove('popup-danger-equation');
            document.getElementById('popup-btn-keep').classList.remove('danger-btn');
        }
        
        modal.style.display = 'block';
    }

    buildEquationString(totals, resultData) {
        const lhs = Object.keys(totals).map(sym => `${totals[sym]}${sym}`).join(' + ');
        let rhs = '?';
        if (resultData && resultData.length > 0) {
            // Extract formula from "Water (H₂O)" -> "H₂O"
            const match = resultData[0].name.match(/\((.*?)\)/);
            rhs = match ? match[1] : resultData[0].name.split(' ')[0];
        }
        return `${lhs} ➔ ${rhs}`;
    }

    showOverlayText(text, color, isBig=false, persist=false) {
        let overlay = document.getElementById('reactor-overlay-text');
        if(!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'reactor-overlay-text';
            overlay.style.position = 'absolute';
            overlay.style.top = '10%';
            overlay.style.width = '100%';
            overlay.style.textAlign = 'center';
            overlay.style.fontFamily = "'Share Tech Mono', monospace";
            overlay.style.zIndex = '9999';
            overlay.style.pointerEvents = 'none';
            overlay.style.textShadow = '0 0 10px rgba(0,0,0,0.8)';
            document.getElementById('three-container').appendChild(overlay);
        }
        
        overlay.style.fontSize = isBig ? '64px' : '32px';
        overlay.style.color = '#' + color;
        overlay.innerHTML = text;
        
        // Fade out slightly after a few seconds unless it's set to persist
        if(!persist) {
            setTimeout(() => { if(overlay.innerHTML === text) overlay.innerHTML = ''; }, 3000);
        }
    }

    animate() {
        if(!this.isAnimating) return;
        requestAnimationFrame(this.animate.bind(this));

        const dt = this.clock.getDelta();

        // Update OrbitControls
        if(this.controls) this.controls.update();

        // Screen Shake
        if (this.screenShake > 0) {
            this.scene.position.x = (Math.random() - 0.5) * this.screenShake;
            this.scene.position.y = (Math.random() - 0.5) * this.screenShake;
            this.screenShake -= 0.1;
            if(this.screenShake <= 0) {
                this.screenShake = 0;
                this.scene.position.set(0,0,0);
            }
        }

        // Camera Zoom Target
        if (this.cameraTargetZ) {
            this.camera.position.z += (this.cameraTargetZ - this.camera.position.z) * 0.02;
        }

        // Atom Translations
        this.atoms.forEach(a => {
            a.mesh.position.lerp(a.target, a.speed);
            
            // Rotate internal orbitals
            a.mesh.children.forEach(child => {
                if(child.type === "Mesh" && child.geometry.type === "TorusGeometry") {
                    child.rotation.x += 0.05;
                    child.rotation.y += 0.05;
                }
            });

            // Molecule rotation
            if (a.isMolecule) {
                // We fake molecule rotation by rotating the scene slightly or rotating atoms around center.
                // Simplified: just let them jitter nicely.
            }
        });

        // Shockwave Expansion
        if (this.shockwave) {
            this.shockwave.scale.x += 1.0;
            this.shockwave.scale.y += 1.0;
            this.shockwave.material.opacity -= 0.02;
            if(this.shockwave.material.opacity <= 0) {
                this.scene.remove(this.shockwave);
                this.shockwave = null;
            }
        }

        // Particles
        this.particles.forEach((p, index) => {
            const positions = p.geometry.attributes.position.array;
            const vels = p.userData.vels;
            for(let i=0; i<vels.length; i++) {
                positions[i*3] += vels[i].x;
                positions[i*3+1] += vels[i].y;
                positions[i*3+2] += vels[i].z;
            }
            p.geometry.attributes.position.needsUpdate = true;
            p.material.opacity -= 0.01;
            if(p.material.opacity <= 0) {
                this.scene.remove(p);
                this.particles.splice(index, 1);
            }
        });

        this.composer.render();
    }

    exitSimulation() {
        this.isAnimating = false;
        
        // Clear loops if running
        if (this.explosionLoopId) {
            clearInterval(this.explosionLoopId);
            this.explosionLoopId = null;
        }

        document.getElementById('three-container').style.opacity = '0';
        setTimeout(() => {
            document.getElementById('three-container').style.pointerEvents = 'none';
            this.clearScene();
            const overlay = document.getElementById('reactor-overlay-text');
            if(overlay) overlay.innerHTML = '';
        }, 1000);
    }
}

window.ReactorEngine = ReactorEngine;
