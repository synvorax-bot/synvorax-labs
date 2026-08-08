/**
 * Synvorax Labs — Background Engine & DNA Helix
 * Three.js particle field, molecular connections, and animated DNA
 */

const BackgroundEngine = (() => {
  let scene, camera, renderer, particles, connections;
  let mouseX = 0, mouseY = 0;
  let animationId = null;
  const MOUSE_INFLUENCE = 0.0003;

  function init() {
    const canvas = document.getElementById('bg-canvas');
    if (!canvas || typeof THREE === 'undefined') return;

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 50;

    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    createParticles();
    createConnections();
    bindEvents();
    animate();
  }

  function createParticles() {
    const count = window.innerWidth < 768 ? 80 : 150;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const velocities = [];

    const colorPalette = [
      new THREE.Color(0x00FF99),
      new THREE.Color(0x00D67F),
      new THREE.Color(0x18E38A),
      new THREE.Color(0xffffff),
    ];

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 120;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 80;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 60;

      const color = colorPalette[Math.floor(Math.random() * colorPalette.length)];
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;

      sizes[i] = Math.random() * 2 + 0.5;
      velocities.push({
        x: (Math.random() - 0.5) * 0.02,
        y: (Math.random() - 0.5) * 0.02,
        z: (Math.random() - 0.5) * 0.01,
      });
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    geometry.userData.velocities = velocities;

    const material = new THREE.PointsMaterial({
      size: 0.8,
      vertexColors: true,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });

    particles = new THREE.Points(geometry, material);
    scene.add(particles);
  }

  function createConnections() {
    const positions = particles.geometry.attributes.position.array;
    const count = positions.length / 3;
    const maxDist = 15;
    const linePositions = [];
    const lineColors = [];

    for (let i = 0; i < count; i++) {
      for (let j = i + 1; j < count; j++) {
        const dx = positions[i * 3] - positions[j * 3];
        const dy = positions[i * 3 + 1] - positions[j * 3 + 1];
        const dz = positions[i * 3 + 2] - positions[j * 3 + 2];
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (dist < maxDist) {
          linePositions.push(
            positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2],
            positions[j * 3], positions[j * 3 + 1], positions[j * 3 + 2]
          );
          const alpha = 1 - dist / maxDist;
          lineColors.push(0, 1, 0.6, alpha * 0.15, 0, 1, 0.6, alpha * 0.15);
        }
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(lineColors, 4));

    const material = new THREE.LineBasicMaterial({
      color: 0x00FF99,
      transparent: true,
      opacity: 0.06,
      blending: THREE.AdditiveBlending,
    });

    connections = new THREE.LineSegments(geometry, material);
    scene.add(connections);
  }

  function bindEvents() {
    document.addEventListener('mousemove', (e) => {
      mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
      mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
    }, { passive: true });

    window.addEventListener('resize', onResize, { passive: true });
  }

  function onResize() {
    if (!camera || !renderer) return;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  function animate() {
    animationId = requestAnimationFrame(animate);

    if (particles) {
      const positions = particles.geometry.attributes.position.array;
      const velocities = particles.geometry.userData.velocities;

      for (let i = 0; i < velocities.length; i++) {
        positions[i * 3] += velocities[i].x + mouseX * MOUSE_INFLUENCE * 10;
        positions[i * 3 + 1] += velocities[i].y + mouseY * MOUSE_INFLUENCE * 10;
        positions[i * 3 + 2] += velocities[i].z;

        if (Math.abs(positions[i * 3]) > 60) velocities[i].x *= -1;
        if (Math.abs(positions[i * 3 + 1]) > 40) velocities[i].y *= -1;
        if (Math.abs(positions[i * 3 + 2]) > 30) velocities[i].z *= -1;
      }

      particles.geometry.attributes.position.needsUpdate = true;
      particles.rotation.y += 0.0003;
      particles.rotation.x += 0.0001;
    }

    camera.position.x += (mouseX * 3 - camera.position.x) * 0.02;
    camera.position.y += (-mouseY * 2 - camera.position.y) * 0.02;
    camera.lookAt(scene.position);

    renderer.render(scene, camera);
  }

  function destroy() {
    if (animationId) cancelAnimationFrame(animationId);
    window.removeEventListener('resize', onResize);
  }

  return { init, destroy };
})();

window.BackgroundEngine = BackgroundEngine;

const DNAHelix = (() => {
  let scene, camera, renderer, helixGroup;
  let animationId = null;
  let mouseX = 0, mouseY = 0;

  function init(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || typeof THREE === 'undefined') return;

    const rect = canvas.parentElement.getBoundingClientRect();
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(45, rect.width / rect.height, 0.1, 1000);
    camera.position.set(0, 0, 12);

    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setSize(rect.width, rect.height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    helixGroup = new THREE.Group();
    createHelix();
    scene.add(helixGroup);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
    scene.add(ambientLight);

    const pointLight = new THREE.PointLight(0x00FF99, 1, 50);
    pointLight.position.set(5, 5, 5);
    scene.add(pointLight);

    const pointLight2 = new THREE.PointLight(0x00D67F, 0.5, 50);
    pointLight2.position.set(-5, -5, 3);
    scene.add(pointLight2);

    document.addEventListener('mousemove', (e) => {
      mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
      mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
    }, { passive: true });

    window.addEventListener('resize', () => onResize(canvas), { passive: true });
    animate();
  }

  function createHelix() {
    const segments = 80;
    const radius = 2;
    const height = 10;
    const strandMaterial1 = new THREE.MeshPhongMaterial({
      color: 0x00FF99,
      emissive: 0x003322,
      shininess: 100,
      transparent: true,
      opacity: 0.9,
    });
    const strandMaterial2 = new THREE.MeshPhongMaterial({
      color: 0x00D67F,
      emissive: 0x002211,
      shininess: 100,
      transparent: true,
      opacity: 0.9,
    });
    const connectorMaterial = new THREE.MeshPhongMaterial({
      color: 0x18E38A,
      emissive: 0x001811,
      transparent: true,
      opacity: 0.6,
    });

    for (let i = 0; i < segments; i++) {
      const t = (i / segments) * Math.PI * 4;
      const y = (i / segments) * height - height / 2;

      const sphere1 = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 16), strandMaterial1);
      sphere1.position.set(Math.cos(t) * radius, y, Math.sin(t) * radius);
      helixGroup.add(sphere1);

      const sphere2 = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 16), strandMaterial2);
      sphere2.position.set(Math.cos(t + Math.PI) * radius, y, Math.sin(t + Math.PI) * radius);
      helixGroup.add(sphere2);

      if (i % 4 === 0) {
        const connector = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, radius * 2, 8), connectorMaterial);
        connector.position.set(0, y, 0);
        connector.rotation.z = Math.PI / 2;
        connector.rotation.y = t;
        helixGroup.add(connector);
      }
    }

    const glowGeometry = new THREE.TorusGeometry(radius + 0.5, 0.02, 8, 100);
    const glowMaterial = new THREE.MeshBasicMaterial({
      color: 0x00FF99,
      transparent: true,
      opacity: 0.15,
    });
    const glow = new THREE.Mesh(glowGeometry, glowMaterial);
    glow.rotation.x = Math.PI / 2;
    helixGroup.add(glow);
  }

  function onResize(canvas) {
    const rect = canvas.parentElement.getBoundingClientRect();
    camera.aspect = rect.width / rect.height;
    camera.updateProjectionMatrix();
    renderer.setSize(rect.width, rect.height);
  }

  function animate() {
    animationId = requestAnimationFrame(animate);

    if (helixGroup) {
      helixGroup.rotation.y += 0.008;
      helixGroup.rotation.x = mouseY * 0.2;
      helixGroup.position.x = mouseX * 0.5;
    }

    renderer.render(scene, camera);
  }

  return { init };
})();

window.DNAHelix = DNAHelix;