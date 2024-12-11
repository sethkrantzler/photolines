const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');

// Define the directories
const inputDir = path.join(__dirname, './static/images/originals');
const thumbnailDir = path.join(__dirname, './static/images/thumbnails');
const compressedDir = path.join(__dirname, './static/images/compressed');
const jsonFile = path.join(__dirname, './static/images/images.json');

// Ensure the output directories exist and are empty
const ensureEmptyDir = (dir) => {
    if (fs.existsSync(dir)) {
        fs.readdir(dir, (err, files) => {
            if (err) {
                console.error(`Error reading ${dir} directory:`, err);
                return;
            }

            files.forEach(file => {
                const filePath = path.join(dir, file);
                fs.unlink(filePath, err => {
                    if (err) {
                        console.error(`Error deleting file ${filePath}:`, err);
                    } else {
                        console.log(`Deleted file: ${file}`);
                    }
                });
            });
        });
    } else {
        fs.mkdirSync(dir, { recursive: true });
    }
};

ensureEmptyDir(thumbnailDir);
ensureEmptyDir(compressedDir);

// Function to resize images
function resizeImage(inputFile, outputFile) {
    ffmpeg(inputFile)
        .ffprobe((err, metadata) => {
            if (err) {
                console.error('Error retrieving metadata:', err);
                return;
            }

            const width = metadata.streams[0].width;
            const height = metadata.streams[0].height;
            const maxWidth = 1200;

            if (width === undefined || height === undefined) {
                console.error('Error: Invalid width or height detected:', width, height);
                return;
            }

            let resizeOption;

            if (width > maxWidth) {
                // Scale width to maxWidth and keep aspect ratio
                resizeOption = `${maxWidth}x?`;
            } else {
                // No need to resize if the width is already less than maxWidth
                resizeOption = `${width}x${height}`;
            }

            ffmpeg(inputFile)
                .size(resizeOption) // Set the maximum width to 1200 pixels while maintaining aspect ratio
                .output(outputFile)
                .on('end', () => {
                    console.log(`Successfully processed ${path.basename(inputFile)}`);
                })
                .on('error', err => {
                    console.error('Error processing file:', err);
                })
                .run();
        });
}

// Function to compress images
function compressImage(inputFile, outputFile) {
    ffmpeg(inputFile)
        .outputOptions([
            '-vcodec mjpeg', // Using libjpeg for JPEG compression
            '-qscale:v 1' // Quality scale: lower value means higher quality and larger file size
        ])
        .output(outputFile)
        .on('end', () => {
            console.log(`Successfully compressed ${path.basename(inputFile)}`);
        })
        .on('error', err => {
            console.error('Error compressing file:', err);
        })
        .run();
}

// Function to check if a file has a valid image extension
function isImageFile(file) {
    const validExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.webp'];
    const ext = path.extname(file).toLowerCase();
    return validExtensions.includes(ext);
}

// Read all folders in the input directory
fs.readdir(inputDir, (err, folders) => {
    if (err) {
        console.error('Error reading input directory:', err);
        return;
    }

    const imgList = [];
    const categoriesList = {};

    folders.forEach(folder => {
        const folderPath = path.join(inputDir, folder);
        if (fs.lstatSync(folderPath).isDirectory()) {
            // Read all files in the folder
            fs.readdir(folderPath, (err, files) => {
                if (err) {
                    console.error(`Error reading folder ${folder}:`, err);
                    return;
                }

                categoriesList[folder] = [];

                files.forEach(file => {
                    if (isImageFile(file)) {
                        const inputFile = path.join(folderPath, file);
                        const thumbnailFile = path.join(thumbnailDir, file);
                        const compressedFile = path.join(compressedDir, file);

                        // Resize the image
                        resizeImage(inputFile, thumbnailFile);

                        // Compress the original image
                        compressImage(inputFile, compressedFile);

                        // Keep track of the image names and categories
                        imgList.push(file);
                        categoriesList[folder].push(file);
                    } else {
                        console.log(`Skipping non-image file: ${file}`);
                    }
                });

                // Write the JSON file after processing each folder
                const jsonData = {
                    imgList: imgList,
                    categoriesList: categoriesList
                };

                console.log(jsonData);

                fs.writeFile(jsonFile, JSON.stringify(jsonData, null, 2), (err) => {
                    if (err) {
                        console.error('Error writing JSON file:', err);
                    } else {
                        console.log('Updated images.json with new data.');
                    }
                });
            });
        }
    });
});
