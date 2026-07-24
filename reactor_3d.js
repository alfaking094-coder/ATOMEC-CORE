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

        // Core variables
        this.atoms = [];
        this.particles = [];
        this.bonds = [];
        this.isAnimating = false;
        this.containmentBox = null;
        this.clock = new THREE.Clock();

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
        
        // Re-add lights
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
        this.scene.add(ambientLight);
        this.scene.add(this.pointLight);
    }

    createSimpleAtom(color, size) {
        const group = new THREE.Group();
        
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

        // Orbitals (Simple rings for performance in multi-atom scenes)
        const ringGeo = new THREE.TorusGeometry(size * 3, 0.05, 16, 100);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.5 });
        
        for(let i=0; i<3; i++) {
            const ring = new THREE.Mesh(ringGeo, ringMat);
            ring.rotation.x = Math.random() * Math.PI;
            ring.rotation.y = Math.random() * Math.PI;
            group.add(ring);
            // Add an electron
            const eGeo = new THREE.SphereGeometry(0.2, 8, 8);
            const eMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
            const electron = new THREE.Mesh(eGeo, eMat);
            electron.position.set(size * 3, 0, 0);
            ring.add(electron);
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
        // Spawn atoms
        const elements = Object.keys(totals);
        let atomMeshes = [];
        let startX = -20;
        
        elements.forEach(sym => {
            for(let i=0; i<totals[sym]; i++) {
                let color = 0x00e5ff;
                if(sym === 'O') color = 0xff0000;
                if(sym === 'H') color = 0xffffff;
                if(sym === 'C') color = 0x444444;
                if(sym === 'N') color = 0x0000ff;
                
                let size = 1.0;
                if(sym === 'H') size = 0.5;
                if(sym === 'O') size = 1.2;
                
                let atom = this.createSimpleAtom(color, size);
                atom.position.set(startX, Math.random() * 10 - 5, Math.random() * 10 - 5);
                this.scene.add(atom);
                atomMeshes.push(atom);
                this.atoms.push({ mesh: atom, target: new THREE.Vector3(startX/5, 0, 0), speed: 0.05 });
                startX += 10;
            }
        });

        // Display equation
        this.showOverlayText("Reaction Initiated...", "00e5ff");

        // Sequence
        setTimeout(() => {
            // Move together
            this.atoms.forEach((a, index) => {
                a.target = new THREE.Vector3(index * 3 - (this.atoms.length * 1.5), 0, 0);
                a.speed = 0.02;
            });
            this.createAudioOscillator('sine', 600, 1.0);
        }, 2000);

        setTimeout(() => {
            // Form bonds
            for(let i=0; i<atomMeshes.length-1; i++) {
                const material = new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.8 });
                const geometry = new THREE.CylinderGeometry(0.2, 0.2, 3, 16);
                const cylinder = new THREE.Mesh(geometry, material);
                
                cylinder.position.x = atomMeshes[i].position.x + 1.5;
                cylinder.rotation.z = Math.PI / 2;
                this.scene.add(cylinder);
                this.bonds.push(cylinder);
            }
            
            // Build the descriptive text
            let outcomeText = "Bonds Formed. Energy Released.";
            if (resultData && resultData.length > 0) {
                let molecules = resultData.map(r => `${r.count}x ${r.name}`).join('<br>');
                let descriptions = resultData.map(r => `<span style="font-size:18px; color:#aaaaaa;">${r.desc}</span>`).join('<br>');
                outcomeText = `${molecules}<br>${descriptions}`;
            }

            this.showOverlayText(outcomeText, "00ff00", false, true);
            this.createParticleExplosion(0, 0, 0, 0x00ff00, 50);
            this.createAudioOscillator('triangle', 800, 0.5, 0.8);
        }, 4000);
        
        setTimeout(() => {
            // Rotate the final molecule
            this.atoms.forEach(a => { a.isMolecule = true; });
        }, 4500);
    }

    runExplosiveReaction(totals, resultData) {
        // Spawn atoms
        const elements = Object.keys(totals);
        let atomMeshes = [];
        let startX = -20;
        
        elements.forEach(sym => {
            for(let i=0; i<totals[sym]; i++) {
                let color = 0x00e5ff;
                if(sym === 'O') color = 0xff0000;
                if(sym === 'H') color = 0xffffff;
                if(sym === 'F') color = 0xffff00;
                let atom = this.createSimpleAtom(color, 1.0);
                atom.position.set(startX, Math.random() * 10 - 5, Math.random() * 10 - 5);
                this.scene.add(atom);
                atomMeshes.push(atom);
                this.atoms.push({ mesh: atom, target: new THREE.Vector3(startX/5, 0, 0), speed: 0.05, originalStartX: startX });
                startX += 10;
            }
        });

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
                let outcomeText = "EXPLOSION!";
                if (resultData && resultData.length > 0) {
                    outcomeText = `${resultData[0].name}<br><span style="font-size:18px; color:#aaaaaa;">${resultData[0].desc}</span>`;
                }
                this.showOverlayText(outcomeText, "ff0000", false, true);
                this.playExplosion();
                this.createParticleExplosion(0, 0, 0, 0xff0000, 300, 2.0);
                this.screenShake = 3.0;

                // Scatter atoms rapidly
                this.atoms.forEach(a => {
                    a.target = new THREE.Vector3((Math.random()-0.5)*100, (Math.random()-0.5)*100, (Math.random()-0.5)*100);
                    a.speed = 0.2;
                });
            }, 3000);

            // Reform in a line
            setTimeout(() => {
                this.atoms.forEach((a, index) => {
                    a.target = new THREE.Vector3(index * 6 - (this.atoms.length * 3), 0, 0);
                    a.speed = 0.05; // Smooth slow return
                });
            }, 4500);
        };

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

        // Screen Shake
        if (this.screenShake > 0) {
            this.camera.position.x = (Math.random() - 0.5) * this.screenShake;
            this.camera.position.y = (Math.random() - 0.5) * this.screenShake;
            this.screenShake -= 0.1;
            if(this.screenShake < 0) this.screenShake = 0;
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
