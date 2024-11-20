// This module tests the Livepeer segmenting model.

// Replace with the actual path to your test image
import {
	MetaSegmentToObjectImages,
	segmentImageSimple,
} from "../src/image-processing/meta-segmenting-to-child-object-images"
import { promises as fsPromises } from 'fs';

const pathToTestImage: string = 'C:\\Users\\rober\\Pictures\\Leonardo-AI\\test-image-1.jpg';

// Directory to save cropped images
const outputDirectory: string = './segment-image-output';

const main = async () => {
	try {
		// Ensure output directory exists
		await fsPromises.mkdir(outputDirectory, { recursive: true });

		// Perform image segmentation
		const segmentationResult = await segmentImageSimple(pathToTestImage);

		// Process the segmentation result to extract object images
		const imageProcessor = new MetaSegmentToObjectImages(pathToTestImage);
		await imageProcessor.processResult(segmentationResult, outputDirectory);

		console.log('Processing completed successfully.');
	} catch (error) {
		console.error('Error during processing:', error);
	}
};

// Execute the main function with an immediately invoked
//  function expression (IIFE) because you can't use await
//  in a top level module.  (note, ts files are treated as
//  CommonJS modules by default).
(async () => {
	try {
		await main();
		console.log('Main function completed.');
	} catch (err) {
		console.error('Error:', err);
		console.error('Failed.')
	}
})();