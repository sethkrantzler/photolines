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
let categoryList = [];
let touchStartX, touchStartY = undefined
let startTime = undefined
let selectedPicture = undefined
let displayPicture = undefined
let displayImage = undefined
let displayFrame = undefined
let lastSelectedPicturePos = undefined
let isAnimating = false
let isGalleryViewEnabled = false;
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

// Environment Map
const rgbeLoader = new RGBELoader()
rgbeLoader.load('./textures/environmentMap/2k.hdr', (environmentMap) =>
{
    environmentMap.mapping = THREE.EquirectangularReflectionMapping

    scene.background = environmentMap
    scene.environment = environmentMap
})
//#region Lights

const directionalLight = new THREE.DirectionalLight('#ffffff', 3)
directionalLight.position.set(1, 1, 0)
scene.add(directionalLight)
//#region Texture
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

//#region Raycaster
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// Controls
// const controls = new OrbitControls(camera, canvas)
// controls.enableDamping = true
// controls.enableRotate = false

//#region Wires

function calcWireLength() {
    return camera.position.z * Math.tan((camera.fov * Math.PI / 180) / 2) * (window.innerWidth / window.innerHeight);
}
parameters.separation = 1.5;
parameters.offset = 2.3;
parameters.categoryWireSeparation = 2.25;
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
    const imageMaterial = new THREE.MeshStandardMaterial({ side: THREE.FrontSide, metalness: 0.25, roughness: 0.1 });
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
function createGalleryWireWithObjects(start, end) {
    const group = new THREE.Group();

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

/**
 * Create a wire with attached spheres and rectangles
 */
function createCategoryWireWithObjects(textureList, start, end) {
    const group = new THREE.Group();

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
    wire.name = "categoryWire"

    group.add(wire);

    // Spheres and Rectangles
    const distance = Math.sqrt((end.x - start.x) ** 2 + (end.z - start.z) ** 2);
    const numRectangles = Math.floor(distance / parameters.pictureSize);

    for (let i = 0; i < textureList.length; i++) {
        const picture = new THREE.Group();
        const texture = textureList[i];
        picture.name = `picture-${picturesLoaded}`;
        picturesLoaded++
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
    const totalWires = isGalleryViewEnabled ? Math.ceil(totalPictures / picturesPerWire) : categoryList.length;

    if (isGalleryViewEnabled) {
        createGalleryWires(totalWires);
    } else {
        createCategoryWires();
    }

    cameraMaxY = 0;
    cameraMinY = isGalleryViewEnabled ? parameters.offset - ((totalWires-1) * parameters.separation) : parameters.offset - ((totalWires-1) * parameters.categoryWireSeparation)
    scene.add(objectsGroup);
    if (iniitialLoad) {
        moveCameraIn(cameraMinY)
    };
}

function createGalleryWires(wires) {
    // Create the necessary number of wires
    for (let i = 0; i < wires; i++) {
        // Calculate yPosition to place the first wire at the top of the screen and then the other wires below it
        const yPosition = parameters.offset - (i * parameters.separation);
        const group = createGalleryWireWithObjects(
            new THREE.Vector3(0, yPosition, -parameters.wireLength),
            new THREE.Vector3(0, yPosition, parameters.wireLength)
        );
        objectsGroup.add(group);
    }
}

function createCategoryWires() {
    categoryList.forEach((category, i) => {
        // Calculate yPosition to place the first wire at the top of the screen and then the other wires below it
        const yPosition = parameters.offset - (i * parameters.categoryWireSeparation);
        const categoryWireLength = parameters.pictureSize * category.images.length
        const categoryTextures = category.images.map((imgName) => textureList[imgList.findIndex((img) => img === imgName)]);
        const group = createCategoryWireWithObjects(categoryTextures,
            new THREE.Vector3(0, yPosition, -(Math.max(categoryWireLength, parameters.wireLength))),
            new THREE.Vector3(0, yPosition, parameters.wireLength)
        );
        objectsGroup.add(group);
    })
}

// Update objects when GUI parameters change
gui.onChange(() => {
    createSceneObjects();
});


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
    categoryList = imgData.categoryList

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
        console.log('Loading screen removed');
    } else {
        console.log('Loading screen element not found');
    }
}

//#region Renderer
const renderer = new THREE.WebGLRenderer({
    canvas: canvas,
})
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
    movePictureOut(picture, new THREE.Vector3(camera.position.z / 2, camera.position.y - sizes.viewportHeight, 0))
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
    // Convert the current position to world coordinates
    const worldPosition = new THREE.Vector3();
    picture.getWorldPosition(worldPosition);

    // Determine the new world position (under the camera)
    const newWorldPosition = new THREE.Vector3(position.x, position.y, 0);

    // Convert the new world position back to the group's local coordinates
    picture.parent.worldToLocal(newWorldPosition);

    // Tween the picture to the new local position
    gsap.to(picture.position, { duration: parameters.animationSpeed, x: newWorldPosition.x, y: newWorldPosition.y, z: newWorldPosition.z, ease: 'power1.in' });

    // Adjust the rotation based on the new position
    gsap.to(picture.rotation, { duration: parameters.animationSpeed, x: 0, y: picture.rotation.y + ((camera.position.z - worldPosition.z) / 8), ease: 'power3.in' });
}


function movePictureIn(picture, position) {
    gsap.to(picture.position, { duration: parameters.animationSpeed, x: position.x, y: position.y, z: position.z, delay: parameters.animationSpeed*0.5, ease:'power1.out'})
    gsap.to(picture.rotation, { duration: parameters.animationSpeed, x: THREE.MathUtils.degToRad(Math.random()*20-10), y: Math.PI / 2, delay: parameters.animationSpeed*0.5, ease:'power3.out'})
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

//#region Events
function onClickEnd(event) {
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

    // If there's an intersection, call update State
    if (intersects.length > 0 && intersects[0].object.parent?.name?.includes('imageContainer') && !isAnimating) {
        if (!selectedPicture) {
            pullPicture(intersects[0].object.parent)
        } else if (displayPicture === intersects[0].object.parent) {
            replacePicture(selectedPicture)
        }
    }
}

let prevMouse = undefined;
let scrollDirection = undefined;
function onClickDrag(event) {
    if (selectedPicture) return
    // Determine the type of event and get the coordinates
    let clientX, clientY;
    if (event.type === 'touchmove') {
        clientX = event.changedTouches[0].clientX;
        clientY = event.changedTouches[0].clientY;
    } else {
        clientX = event.clientX;
        clientY = event.clientY;
    }
    mouse.x = (clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(clientY / window.innerHeight) * 2 + 1;

    if (prevMouse && isClicking && !scrollDirection) {
        const deltaX = Math.abs(prevMouse.x - mouse.x);
        const deltaY = Math.abs(prevMouse.y - mouse.y);

        prevMouse = { x: mouse.x, y: mouse.y };
        scrollDirection = deltaX > deltaY ? 'x' : 'y';
    } else if (scrollDirection) {
        if (scrollDirection === 'x') {
            // Update the raycaster with the camera and mouse position
            raycaster.setFromCamera(mouse, camera);
    
            // Calculate objects intersecting the raycaster
            const intersects = raycaster.intersectObjects(scene.children);
            console.log("drag in progress x");
    
            // If there's an intersection, call update State
            if (intersects.length > 0 && intersects[0].object.parent?.name?.includes('imageContainer')) {
                const deltaX = prevMouse.x - mouse.x;
                prevMouse = { x: mouse.x, y: mouse.y };
                const wire = intersects[0].object.parent.parent.parent
                wire.position.z += deltaX * 2
                // clamp wire position to some parameter
            }
        } else {
            console.log("drag in progress y");
            const movementY = event.type === 'touchmove' ? event.changedTouches[0].clientY : event.clientY
            const deltaY = movementY - (initialTouchY !== null ? initialTouchY : initialMouseY);
            if (event.type === 'touchmove') {
                initialTouchY = movementY;
            } else {
                initialMouseY = movementY;
            }
    
            velocityY = deltaY * 0.01;
            if (animationFrameId !== null) {
                cancelAnimationFrame(animationFrameId);
            }
            animateDeceleration();
        }
    }
    else {
        prevMouse = { x: mouse.x, y: mouse.y };
    }
}
// Global Variables
let initialMouseY = null;
let isClicking = false;
let initialTouchY = null;
let velocityY = 0;
let damping = 0.975; // Adjust this factor to control the damping effect
let animationFrameId = null;
let isTouching = false;
const cursor = {}
cursor.x = 0
cursor.y = 0

function onMouseDown(event) {
    isClicking = true;
    startTime = Date.now()
    touchStartX = event.clientX;
    touchStartY = event.clientY;

    if (!selectedPicture) {
        initialMouseY = touchStartY; // Store the initial touch position
    }
}

function onMouseUp(event) {
    isClicking = false;
    scrollDirection = undefined;
    prevMouse = undefined;
    const mouseEndX = event.clientX;
    const mouseEndY = event.clientY;

    const deltaX = mouseEndX - touchStartX;
    const deltaY = mouseEndY - touchStartY;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    const time = Date.now()-startTime

    if ((time < 50 || distance < 4) || (selectedPicture && time < 100)) {
        onClickEnd(event);
    }

    initialMouseY = null; // Reset the initial touch position
}


// Function to handle touch start event
function onTouchStart(event) {
    isClicking = true;
    startTime = Date.now();
    touchStartX = event.touches[0].clientX;
    touchStartY = event.touches[0].clientY;

    if (!selectedPicture) {
        initialTouchY = touchStartY; // Store the initial touch position
    }
}


// Function to handle touch end event
function onTouchEnd(event) {
    isClicking = false;
    scrollDirection = undefined;
    prevMouse = undefined;
    const touchEndX = event.changedTouches[0].clientX;
    const touchEndY = event.changedTouches[0].clientY;

    const deltaX = touchEndX - touchStartX;
    const deltaY = touchEndY - touchStartY;
    const time = Date.now() - startTime;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    console.log(distance)

    if ((time < 100 && distance < 5) || (selectedPicture && time < 100)) {
        onClickEnd(event);
    }

    initialTouchY = null; // Reset the initial touch position
}

// Function to handle deceleration animation
function animateDeceleration() {
    if ((!isClicking || !isTouching) && Math.abs(velocityY) > 0.001) {
        // Apply damping to reduce velocity
        velocityY *= damping;

        // Adjust the camera position based on the velocity
        camera.position.y += velocityY;
        camera.position.y = Math.min(Math.max(camera.position.y, cameraMinY), cameraMaxY);

        // Request the next animation frame
        animationFrameId = requestAnimationFrame(animateDeceleration);
    } else {
        // Stop the animation if velocity is too low
        velocityY = 0;
        animationFrameId = null;
    }
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
    damping = 0.95; // Adjust this factor to control the damping effect
    window.addEventListener('touchstart', onTouchStart, false);
    window.addEventListener('touchmove', onClickDrag, false);
    window.addEventListener('touchend', onTouchEnd, false);
} else {
    window.addEventListener('mousemove', onClickDrag, false);
    window.addEventListener('mousedown', onMouseDown, false);
    window.addEventListener('mouseup', onMouseUp, false);
}
tick()
