import * as THREE from 'three'
import { RGBELoader } from 'three/examples/jsm/Addons.js'
import GUI from 'lil-gui'
import gsap from 'gsap'
import { OrbitControls } from 'three/examples/jsm/Addons.js'

/**
 * Debug
 */
const gui = new GUI()
gui.hide()

//#region Variables
let picturesLoaded = 0;
let totalPictures = undefined;
let imgList = [];
let textureList = [];
let touchStartX, touchStartY = undefined
let startTime = undefined
let selectedPicture = undefined
let displayPicture = undefined
let displayImage = undefined
let displayFrame = undefined
let lastSelectedPicturePos = undefined
let isAnimating = false
let cameraMaxY, cameraMinY = undefined;
//#endregion

const parameters = {
    materialColor: '#ffeded',
    animationSpeed: 0.5,
    framePadding: 0.05
}

/**
 * Base
 */
// Canvas
const canvas = document.querySelector('canvas.webgl')

// Scene
const scene = new THREE.Scene({color: 'tan'})

// // Environment Map
// const rgbeLoader = new RGBELoader()
// rgbeLoader.load('./textures/environmentMap/2k.hdr', (environmentMap) =>
// {
//     environmentMap.mapping = THREE.EquirectangularReflectionMapping

//     scene.background = environmentMap
//     scene.environment = environmentMap
// })

/**
 * Overlay
 */
const overlayGeometry = new THREE.PlaneGeometry(2, 2, 1, 1)
const overlayMaterial = new THREE.ShaderMaterial({
    transparent: true,
    uniforms:
    {
        uAlpha: { value: 1 }
    },
    vertexShader: `
        void main()
        {
            gl_Position = vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform float uAlpha;

        void main()
        {
            gl_FragColor = vec4(0.0, 0.0, 0.0, uAlpha);
        }
    `
})
const overlay = new THREE.Mesh(overlayGeometry, overlayMaterial)
scene.add(overlay)

//#region Lights

function generateWall() {
    const geometry = new THREE.PlaneGeometry(100, 100);
    const material = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const plane = new THREE.Mesh(geometry, material);
    plane.receiveShadow = true; // Enable shadow receiving for the plane
    plane.rotation.y = Math.PI / 2; // Rotate the plane to face the camera
    plane.position.x = -0.5; // Position the plane behind the images
    scene.add(plane);
}

// Call generateWall to add the background
generateWall();

const directionalLight = new THREE.DirectionalLight('#ffffff', 0.5)
directionalLight.position.set(1, 1, 0)
scene.add(directionalLight)

// Create a spotlight
const spotlightIntensity = 10;
const spotlightDistance = 7.8;
const spotlightAngle = 0.54;
const spotlightPenumbra = 0.5;
const spotlightDecay = 0.33;
const spotLight = new THREE.SpotLight('#ffffff', spotlightIntensity, spotlightDistance, spotlightAngle, spotlightPenumbra, spotlightDecay);
spotLight.position.set(0, 1, 0);
spotLight.castShadow = true;
spotLight.shadow.mapSize.width = 1024;
spotLight.shadow.mapSize.height = 1024;
scene.add(spotLight);
scene.add(spotLight.target)

// Add a spotlight helper to visualize the spotlight
// const spotLightHelper = new THREE.SpotLightHelper(spotLight);
// scene.add(spotLightHelper);

// Add lil-gui controls
const lightFolder = gui.addFolder('Spotlight Position');
lightFolder.add(spotLight, 'intensity', 0, 100).name('Intensity');
lightFolder.add(spotLight, 'distance', 0, 100).name('Distance');
lightFolder.add(spotLight, 'angle', 0, Math.PI / 2).name('Angle');
lightFolder.add(spotLight, 'penumbra', 0, 5).name('Penumbra');
lightFolder.add(spotLight, 'decay', 0, 5).name('Decay');
lightFolder.add(spotLight.position, 'x', -10, 10).name('X Position').onChange(() => spotLightHelper.update());
lightFolder.add(spotLight.position, 'y', -10, 10).name('Y Position').onChange(() => spotLightHelper.update());
lightFolder.add(spotLight.position, 'z', -10, 10).name('Z Position').onChange(() => spotLightHelper.update());
lightFolder.open();

//#region Loaders
const textureLoader = new THREE.TextureLoader()

//#region Sizes
let sizes = {
    width: window.innerWidth,
    height: window.innerHeight
}

function calcViewportDistance() {
    // Distance from the camera to the point of interest (e.g., the origin)
    const distance = camera.position.z;

    // Calculate the vertical field of view in radians
    const vFOV = THREE.MathUtils.degToRad(camera.fov);

    // Compute the viewport height at the given distance
    sizes.viewportHeight = 2 * Math.tan(vFOV / 2) * distance;

    // Compute the viewport width using the aspect ratio
    const aspectRatio = window.innerWidth / window.innerHeight;
    sizes.viewportWidth = sizes.viewportHeight * aspectRatio;

    // Calculate left and right x/z coordinates
    const left = camera.position.x - sizes.viewportWidth / 2;
    const right = camera.position.x + sizes.viewportWidth / 2;

    // Log the results
    console.log(`Viewport distance: ${distance} units`);
    console.log(`Viewport width: ${sizes.viewportWidth} units`);
    console.log(`Viewport height: ${sizes.viewportHeight} units`);
    console.log(`Left x/z coordinates: ${left}`);
    console.log(`Right x/z coordinates: ${right}`);
}

/**
 * Calculate the distance from the camera that an object with given dimensions 
 * takes up a specified percentage of the screen width or height.
 * @param {number} objectWidth - The width of the object.
 * @param {number} objectHeight - The height of the object.
 * @param {number} screenPercentage - The percentage of the screen width or height the object should occupy.
 * @returns {number} - The required distance from the camera.
 */
function calcObjectDistance(objectWidth, objectHeight, screenPercentage) {
    // Calculate the screen percentage as a decimal
    const screenSizePercentage = screenPercentage / 100;

    // Calculate the vertical field of view in radians
    const vFOV = THREE.MathUtils.degToRad(camera.fov);

    // Calculate the aspect ratio
    const aspectRatio = window.innerWidth / window.innerHeight;

    // Compute the required distance based on the larger dimension
    const distanceWidth = (objectWidth / (2 * screenSizePercentage * aspectRatio)) / Math.tan(vFOV / 2);
    const distanceHeight = (objectHeight / (2 * screenSizePercentage)) / Math.tan(vFOV / 2);

    // Check if the object fits within the smaller dimension and recalculate if necessary
    const requiredDistance = Math.max(distanceWidth, distanceHeight);

    // Log the result
    console.log(`Required distance from camera: ${requiredDistance} units`);

    return requiredDistance;
}

window.addEventListener('resize', () =>
{
    // Update sizes
    sizes.width = window.innerWidth
    sizes.height = window.innerHeight

    // Update camera
    camera.aspect = sizes.width / sizes.height
    camera.updateProjectionMatrix()

    calcViewportDistance()

    // Update renderer
    renderer.setSize(sizes.width, sizes.height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    parameters.wireLength = calcWireLength();
    picturesLoaded = 0;
    createSceneObjects();
})

//#region Camera
// Group
const cameraGroup = new THREE.Group()
scene.add(cameraGroup)

// Base camera
const camera = new THREE.PerspectiveCamera(50, sizes.width / sizes.height, 0.1, 100)
camera.position.z = 6
cameraGroup.add(camera)

cameraGroup.rotation.y = Math.PI / 2
calcViewportDistance();
spotLight.parent = camera;

//#region Raycaster
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// Controls
// const controls = new OrbitControls(camera, canvas)
// controls.enableDamping = true

//#region Wires

function calcWireLength() {
    return camera.position.z * Math.tan((camera.fov * Math.PI / 180) / 2) * (window.innerWidth / window.innerHeight);
}
parameters.separation = 1.5;
parameters.offset = 2.3;
parameters.wireThickness = 0.013;
parameters.pictureSize = 1.2;
parameters.pinSize = 0.02;
parameters.tension = 0.4;
parameters.wireLength = calcWireLength();

// GUI Setup
gui.add(parameters, 'separation', -5, 5, 0.1).name('Separation');
gui.add(parameters, 'offset', -5, 5, 0.1).name('Offset');
gui.add(parameters, 'pictureSize', 0.1, 2, 0.1).name('Picture Size');
// gui.add(parameters, 'wireThickness', 0.01, 0.5, 0.01).name('Wire Thickness');
// gui.add(parameters, 'wireLength', 0.1, 5, 0.1).name('Wire Length');
// gui.add(parameters, 'pinSize', 0.01, 0.5, 0.01).name('Pin Size');
gui.add(parameters, 'tension', 0.1, 2, 0.1).name('Tension');

function createDisplayPicture() {
    displayPicture = new THREE.Group();
    displayPicture.name = `imageContainer`;
    // Frame
    const rectGeometry = new THREE.PlaneGeometry(parameters.pictureSize, parameters.pictureSize * 1.5);
    const rectMaterial = new THREE.MeshBasicMaterial({ color: 'white', side: THREE.DoubleSide });
    displayFrame = new THREE.Mesh(rectGeometry, rectMaterial);
    displayFrame.name = 'frame'
    const imageGeometry = new THREE.PlaneGeometry(parameters.pictureSize / 2, parameters.pictureSize * 1);
    const imageMaterial = new THREE.MeshBasicMaterial({ side: THREE.FrontSide});
    displayImage = new THREE.Mesh(imageGeometry, imageMaterial);
    displayImage.name = 'picture'
    displayImage.position.z = 0.02

    // Calculate the right distance from camera for it to be based on largest size
    displayPicture.position.set(4, -sizes.viewportHeight*2, 0);
    // Rotate y by 90 degrees
    displayPicture.rotation.y = Math.PI / 2;
    displayPicture.add(displayFrame, displayImage);
    displayPicture.visible = false;
    scene.add(displayPicture)
}

// Function to update the display picture asynchronously
async function updateDisplayPicture() {
    const pictureChild = selectedPicture.children.find((obj) => obj.name.includes('picture'));
    displayImage.material.map = pictureChild.material.map
    displayImage.geometry = pictureChild.geometry;
    displayFrame.geometry = selectedPicture.children.find((obj) => obj.name === 'frame').geometry;
}

createDisplayPicture()

/**
 * Create a wire with attached spheres and rectangles
 */
function createWireWithObjects(start, end) {
    const group = new THREE.Group();
    group.castShadow = true;

    // Wire
    const wireMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const wireSegments = 200;
    const curvePoints = [];

    for (let i = 0; i <= wireSegments; i++) {
        const t = i / wireSegments;
        const x = THREE.MathUtils.lerp(start.x, end.x, t);
        const z = THREE.MathUtils.lerp(start.z, end.z, t);

        const midpoint = 0.5;
        const y = start.y + parameters.tension * -1 * (1 - 4 * (t - midpoint) * (t - midpoint));
        curvePoints.push(new THREE.Vector3(x, y, z));
    }

    const curve = new THREE.CatmullRomCurve3(curvePoints);
    const wireGeometry = new THREE.TubeGeometry(curve, wireSegments, parameters.wireThickness, 8, false);
    const wire = new THREE.Mesh(wireGeometry, wireMaterial);
    wire.castShadow = true;
    wire.receiveShadow = true;
    group.add(wire);

    // Spheres and Rectangles
    const distance = Math.sqrt((end.x - start.x) ** 2 + (end.z - start.z) ** 2);
    const effectiveDistance = distance - parameters.pictureSize;
    const numRectangles = Math.floor(distance / parameters.pictureSize);
    console.log(`The number of pictures that fit into distance: ${distance}, effective distance: ${effectiveDistance} because of picture size ${parameters.pictureSize} is ${numRectangles}`)

    for (let i = 0; i < numRectangles; i++) {
        const picture = new THREE.Group();
        const texture = textureList[picturesLoaded];
        picture.name = `picture-${picturesLoaded}`;
        picturesLoaded++
        if (picturesLoaded > totalPictures) return group;
        // Calculate the parameter t for equal spacing along the curve
        const t = (1 - (i*parameters.pictureSize / distance)) - (1 / (2*numRectangles));
        const pos = curve.getPointAt(t);
        console.log(`The t for picture ${i} is ${t} with pos ${JSON.stringify(pos)}`)

        
        // Sphere
        const sphereGeometry = new THREE.SphereGeometry(parameters.pinSize, 16, 16);
        const sphereMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
        sphere.position.set(pos.x, pos.y, pos.z);
        sphere.position.x += 0.02

        // Image 
        const imageContainer = new THREE.Group();

        const imgWidth = texture.image.width;
        const imgHeight = texture.image.height;
        let width, height;

        // Adjust geometry dimensions based on image size
        if (imgWidth > imgHeight) {
            width = parameters.pictureSize * 0.95;
            height = (imgHeight / imgWidth) * width;
        } else {
            height = parameters.pictureSize * 0.95;
            width = (imgWidth / imgHeight) * height;
        }


        // Frame
        imageContainer.name = 'imageContainer'
        const rectGeometry = new THREE.PlaneGeometry(width + parameters.framePadding, height + parameters.framePadding);
        const rectMaterial = new THREE.MeshBasicMaterial({ color: 'white', side: THREE.DoubleSide });
        const frame = new THREE.Mesh(rectGeometry, rectMaterial);
        frame.name = 'frame'
        frame.position.z = 0.0199;
        frame.castShadow = true;
        frame.receiveShadow = true;

        // Image geometry and material
        const imageGeometry = new THREE.PlaneGeometry(width, height);
        texture.colorSpace = THREE.SRGBColorSpace
        const imageMaterial = new THREE.MeshStandardMaterial({
            map: texture,
            metalness: 0.5,
            roughness: 0.1,
        });
        const image = new THREE.Mesh(imageGeometry, imageMaterial);
        image.name = 'picture'+(picturesLoaded);
        image.position.z = 0.02;

        // Add the image to the scene or group
        imageContainer.add(image);
            // Image Container
        imageContainer.add(frame) 
        imageContainer.position.set(pos.x, pos.y - 0.5*height, pos.z);
        imageContainer.rotation.x = THREE.MathUtils.degToRad(Math.random()*20-10);
        // Rotate y by 90 degrees
        imageContainer.rotation.y = Math.PI / 2;

        picture.add(sphere);
        picture.add(imageContainer);
        group.add(picture);
    }

    return group;
}

let objectsGroup = new THREE.Group();
function createSceneObjects(iniitialLoad = false) {
    scene.remove(objectsGroup);
    objectsGroup = new THREE.Group();

    // Calculate the number of pictures each wire can hold
    const picturesPerWire = Math.floor(2 * parameters.wireLength / parameters.pictureSize);

    // Calculate the total number of wires needed
    const totalWires = Math.ceil(totalPictures / picturesPerWire);

    // Create the necessary number of wires
    for (let i = 0; i < totalWires; i++) {
        // Calculate yPosition to place the first wire at the top of the screen and then the other wires below it
        const yPosition = parameters.offset - (i * parameters.separation);
        const group = createWireWithObjects(
            new THREE.Vector3(0, yPosition, -parameters.wireLength),
            new THREE.Vector3(0, yPosition, parameters.wireLength)
        );
        objectsGroup.add(group);
    }

    cameraMaxY = 0;
    cameraMinY = parameters.offset - ((totalWires-1) * parameters.separation);
    scene.add(objectsGroup);
    if (iniitialLoad) {
        moveCameraIn(cameraMaxY)
    };
}

// Update objects when GUI parameters change
// gui.onChange(() => {
//     createSceneObjects();
// });


//#region Image Loading
// Function to load a texture asynchronously
function loadTextureAsync(url) {
    return new Promise((resolve, reject) => {
        const loader = new THREE.TextureLoader();
        loader.load(
            url,
            texture => {
                resolve(texture); // On successful load
            },
            undefined,
            error => {
                reject(error); // On error
            }
        );
    });
}

// Function to fetch the image list and load textures
async function fetchImageList() { 
    const response = await fetch('/images/images.json');
    const imgData = await response.json();
    imgList = imgData.imgList

    for (const img of imgList) {
        const url = `images/thumbnails/${img}`;
        try {
            const texture = await loadTextureAsync(url);
            textureList.push(texture);
            console.log(`Loaded texture for ${img}`);
        } catch (error) {
            console.error(`Error loading texture for ${img}:`, error);
        }
    }

    // Set totalPictures and pass textureList to createSceneObjects
    totalPictures = imgList.length;
    createSceneObjects(true);
}

fetchImageList()

// Function to remove the loading screen element
function removeLoadingScreen() {
    const loadingScreen = document.getElementById('loadingScreen');
    if (loadingScreen) {
        loadingScreen.parentNode.removeChild(loadingScreen);
        gsap.to(overlayMaterial.uniforms.uAlpha, { duration: 0.5, value: 0 })
        console.log('Loading screen removed');
    } else {
        console.log('Loading screen element not found');
    }
}

//#region Renderer
const renderer = new THREE.WebGLRenderer({
    canvas: canvas
})
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap; // You can choose the shadow map type
renderer.setSize(sizes.width, sizes.height)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

//#region Animate
const clock = new THREE.Clock()
let previousTime = 0

const tick = () =>
{
    const elapsedTime = clock.getElapsedTime()
    const deltaTime = elapsedTime - previousTime
    previousTime = elapsedTime
    // Render

     const parallaxX = cursor.x * 0.5
     const parallaxY = - cursor.y * 0.5

     if (!selectedPicture && !isAnimating) {
        displayPicture.position.y = camera.position.y - sizes.viewportHeight
     }
     
    cameraGroup.position.x += (parallaxX - cameraGroup.position.x) * 5 * deltaTime
    cameraGroup.position.y += (parallaxY - cameraGroup.position.y) * 5 * deltaTime
    renderer.render(scene, camera)

    // Call tick again on the next frame
    window.requestAnimationFrame(tick)
}

//#region GSAP

function pullPicture(picture) {
    selectedPicture = picture;
    updateDisplayPicture()
    lastSelectedPicturePos = new THREE.Vector3(picture.position.x, picture.position.y, picture.position.z)
    stopCameraScroll()
    movePictureOut(picture, new THREE.Vector3(camera.position.z / 2,camera.position.y - sizes.viewportHeight,0))
    moveDisplayPicture(true)
}

function replacePicture(picture) {
    moveDisplayPicture(false)
    // move the picture into end coordinates
    movePictureIn(picture, lastSelectedPicturePos)
    lastSelectedPicturePos = undefined
    selectedPicture = undefined
}

function nextPicture(pictureGroup) {
    // find the next picture
    // replace current picture
    // pull next picture

}

function previousPicture(pictureGroup) {
    // find the prev picture
    // replace current picture
    // pull prev picture
}

function movePictureOut(picture, position) {
    gsap.to(picture.position, { duration: parameters.animationSpeed, x: position.x, y: position.y, z: position.z, ease:'power1.in'})
    gsap.to(picture.rotation, { duration: parameters.animationSpeed, x: 0, y: picture.rotation.y + (picture.position.z/8), ease:'power1.out'})
}

function movePictureIn(picture, position) {
    gsap.to(picture.position, { duration: parameters.animationSpeed, x: position.x, y: position.y, z: position.z, delay: parameters.animationSpeed*0.5, ease:'power1.out'})
    gsap.to(picture.rotation, { duration: parameters.animationSpeed, x: THREE.MathUtils.degToRad(Math.random()*20-10), y: Math.PI / 2, delay: parameters.animationSpeed*0.5, ease:'power1.in'})
}

function moveDisplayPicture(reverse) {
    isAnimating = true
    const frame = displayPicture.children.find((obj) => obj.name === 'frame').geometry
    gsap.to(displayPicture.position, { 
        duration: parameters.animationSpeed,
        x: reverse ? camera.position.z - calcObjectDistance(frame.parameters.width, frame.parameters.height, 95) : 0,
        y: reverse ? camera.position.y : camera.position.y - sizes.viewportHeight,
        ease:  reverse ? "power4.out" : "power4.in",
        delay: reverse ? parameters.animationSpeed*0.5 : 0
    })
    setTimeout(() => isAnimating = false, parameters.animationSpeed*1000)
}

function moveCameraIn(yMax) {
    const endPosition = new THREE.Vector3(camera.position.x, camera.position.y, camera.position.z);
    const startPositionZ = calcObjectDistance(sizes.viewportWidth, yMax, 100)*10
    const startPositionY = (yMax-parameters.offset)*0.5
    camera.position.z = startPositionZ
    camera.position.y = startPositionY
    gsap.to(camera.position, { 
        duration: parameters.animationSpeed*2,
        y: endPosition.y,
        z: endPosition.z,
        ease:  "power4.out",
        delay: parameters.animationSpeed*2,
        onStart: () => {  removeLoadingScreen(); },
        onComplete: () => { displayPicture.visible = true; }
    })
}

function isImageContainerIntersect(intersect) {
    return intersect.object.parent?.name?.includes('imageContainer');
}

//#region Events
function onMouseClick(event) {
    // Check if the event is a touch event
    if (event.type === 'touchend') {
        // Use the first touch point from changedTouches
        mouse.x = (event.changedTouches[0].clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(event.changedTouches[0].clientY / window.innerHeight) * 2 + 1;
    } else {
        // Use the mouse coordinates
        mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    }

    // Update the raycaster with the camera and mouse position
    raycaster.setFromCamera(mouse, camera);

    // Calculate objects intersecting the raycaster
    const intersects = raycaster.intersectObjects(scene.children);
    const imageContainerIntersects = intersects.filter(isImageContainerIntersect);

    // If there's an intersection, call update State
    if (imageContainerIntersects.length > 0) {
        if (selectedPicture) {
            replacePicture(selectedPicture)
        } else {
            pullPicture(imageContainerIntersects[0].object.parent)
        }
    }
}

let scrollY = window.scrollY
const cursor = {}
cursor.x = 0
cursor.y = 0

function onMouseDown(event) {
    startTime = Date.now()
    touchStartX = event.clientX;
    touchStartY = event.clientY;
}

function onMouseUp(event) {
    const mouseEndX = event.clientX;
    const mouseEndY = event.clientY;

    const deltaX = mouseEndX - touchStartX;
    const deltaY = mouseEndY - touchStartY;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    const time = Date.now()-startTime

    if ((time < 200 || distance < 4) || selectedPicture) {
        onMouseClick(event);
    }
}

// Global Variables
let initialMouseY = null;
let isDragging = false;
let initialTouchY = null;
let velocityY = 0;
let damping = 0.9; // Adjust this factor to control the damping effect
let scrollRate = 0.0075
let animationFrameId = null;
let isTouching = false;

// Function to handle mouse down event
function onMouseScrollDown(event) {
    if (selectedPicture) return;
    initialMouseY = event.clientY; // Store the initial mouse position
    isDragging = true; // Set dragging flag to true
}

// Function to handle mouse move event
function onMouseScrollMove(event) {
    if (isDragging) {
        const mouseY = event.clientY; // Current mouse position
        const deltaY = mouseY - initialMouseY; // Change in mouse position

        // Adjust the camera position based on the change in mouse position
        camera.position.y += deltaY * scrollRate; // Adjust the 0.01 factor to control the scroll speed
        // Update the initial mouse position for the next move event
        updateSpotlightPosition(deltaY*scrollRate);
        initialMouseY = mouseY;

        // Update velocity for deceleration
        velocityY = deltaY * 0.01;

        // Cancel any existing animation frame
        if (animationFrameId !== null) {
            cancelAnimationFrame(animationFrameId);
        }

        // Start the deceleration animation
        animateDeceleration();
    }
}

// Function to handle mouse up event
function onMouseScrollUp(event) {
    isDragging = false; // Reset the dragging flag
}

// Function to handle touch start event
function onTouchStart(event) {
    isTouching = true;
    startTime = Date.now();
    touchStartX = event.touches[0].clientX;
    touchStartY = event.touches[0].clientY;

    if (!selectedPicture) {
        initialTouchY = touchStartY; // Store the initial touch position
    }
}

// Function to handle touch move event
function onTouchMove(event) {
    if (initialTouchY !== null && !selectedPicture) {
        const touchY = event.touches[0].clientY; // Current touch position
        const deltaY = touchY - initialTouchY; // Change in touch position

        // Adjust the camera position based on the change in touch position
        camera.position.y += deltaY * scrollRate; // Adjust the 0.01 factor to control the scroll speed
        updateSpotlightPosition(deltaY*scrollRate);

        // Update the initial touch position for the next move event
        initialTouchY = touchY;

        // Update velocity for deceleration
        velocityY = deltaY * 0.01;

        // Cancel any existing animation frame
        if (animationFrameId !== null) {
            cancelAnimationFrame(animationFrameId);
        }

        // Start the deceleration animation
        animateDeceleration();
    }
}

// Function to handle touch end event
function onTouchEnd(event) {
    isTouching = false;
    const touchEndX = event.changedTouches[0].clientX;
    const touchEndY = event.changedTouches[0].clientY;

    const deltaX = touchEndX - touchStartX;
    const deltaY = touchEndY - touchStartY;
    const time = Date.now() - startTime;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    console.log(distance)

    if ((time < 100 || distance < 20) || selectedPicture) {
        onMouseClick(event);
    }

    initialTouchY = null; // Reset the initial touch position
}

// Function to handle deceleration animation
function animateDeceleration() {
    if ((!isDragging || !isTouching) && Math.abs(velocityY) > 0.001) {
        // Apply damping to reduce velocity
        velocityY *= damping;

        // Adjust the camera position based on the velocity
        camera.position.y += velocityY;
        camera.position.y = Math.min(Math.max(camera.position.y, cameraMinY), cameraMaxY);
        updateSpotlightPosition(velocityY);

        // Request the next animation frame
        animationFrameId = requestAnimationFrame(animateDeceleration);
    } else {
        // Stop the animation if velocity is too low
        velocityY = 0;
        animationFrameId = null;
    }
}

function updateSpotlightPosition(deltaY) {
    if (camera.position.y + deltaY < cameraMinY || camera.position.y + deltaY > cameraMaxY) return;
    spotLight.target.position.y += deltaY;
    spotLight.target.position.y = Math.min(Math.max(spotLight.target.position.y, cameraMinY), cameraMaxY);
}

// Function to stop the camera scroll
function stopCameraScroll() {
    if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
        velocityY = 0;
    }
}


function isMobileDevice() {
    return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

if (isMobileDevice()) {
    window.addEventListener('touchstart', onTouchStart, false);
    window.addEventListener('touchmove', onTouchMove, false);
    window.addEventListener('touchend', onTouchEnd, false);
} else {
    window.addEventListener('mousedown', onMouseScrollDown, false);
    window.addEventListener('mousemove', onMouseScrollMove, false);
    window.addEventListener('mouseup', onMouseScrollUp, false);
    window.addEventListener('mousedown', onMouseDown, false);
    window.addEventListener('mouseup', onMouseUp, false);
}
tick()
