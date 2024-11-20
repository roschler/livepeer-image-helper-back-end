// This module contains code for interacting with the AWS Secrets
//  Manager.

// NOTE: Putting the imports before the createRequire assigment
//  may be necessary.
import {createRequire} from "module";

import AWS from 'aws-sdk';
import { conformErrorObjectMsg } from "../../common-routines.js"

// This is the response type from a call to get a value
//  from a secret.
interface SecretResponse {
    SecretString: string;
}

/**
 * Retrieves a secret from AWS Secrets Manager and returns it as an object.
 *
 * @param {String} secretName - The name or ARN of the secret.
 * @param {String} region - The AWS region where the secret is stored.
 *
 * @returns {Promise<Object>} A promise that resolves to an object
 *  containing the secret's key/value pairs.
 * @throws {Error} If the input parameters are invalid or if an error
 *  occurs while retrieving the secret.
 *
 * @async
 */
export async function getAwsSecret_async(secretName: string, region: string ='us-east-1') {
    const errPrefix = `(getAwsSecret) `;

    if (secretName.length < 1)
        throw new Error(`${errPrefix}The secretName parameter is empty or invalid.`);
    if (region.length < 1)
        throw new Error(`${errPrefix}The region parameter is empty or invalid.`);

    // Configure the AWS SDK with the specified region
    AWS.config.update({ region });

    // Create a Secrets Manager client
    const secretsManager = new AWS.SecretsManager();

    // Define the parameters for retrieving the secret
    const parametersObj = {
        SecretId: secretName,
    };

    try {
        let bErrorOccurred = false;
        let errMsg = '(none)';

        const rawSecretObj =
                await secretsManager.getSecretValue(parametersObj).promise()
            .catch(err => {
                bErrorOccurred = true;

                // Build the error message.
                const subErrMsg = conformErrorObjectMsg(err);
                errMsg = `${errPrefix} -> The following error occurred when calling secretsManager.getSecretValue().promise(): ${subErrMsg}`;

                console.error(`${errMsg} - promise`);
            });

        // Did an error occur?
        if (bErrorOccurred)
            // Throw the error message that was set.
            throw new Error(errMsg);


        // Parse the secret string into an object
        const secretString =
            (rawSecretObj as  SecretResponse).SecretString

        const secretObject = JSON.parse(secretString);

        return secretObject;
    } catch (err) {
        // Handle errors and provide a detailed error message
        throw new Error(`Error retrieving secret "${secretName}" in region "${region}": ${err.message}`);
    }
}
