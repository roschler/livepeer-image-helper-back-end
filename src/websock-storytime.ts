import "dotenv/config"

import type WebSocket from "ws"
import fs, { createWriteStream } from "fs"
import websocket, { SocketStream } from "@fastify/websocket"
import type { FastifyInstance, FastifyRequest } from "fastify"
import { generateStory } from "./openai-storytime"
import { Genre, StateType, ErrorType, RequestPayload_storytime } from "./system/types"
import {
	generateImages_storytime,
	sendStateMessage,
	sendErrorMessage,
	sendImageMessage,
	sendTextMessage,
	saveImageURLs,
	saveMetaData_storytime,
} from "./system/handlers"
import path from "node:path"
import { isFlagged } from "./openai-common"

// What do we say when the user is trying to be problematic?

const CONSOLE_CATEGORY = 'websocket';

const badPromptError =
	process.env.HARMFUL_PROMPT_RESPONSE ??
	"I'm sorry, Dave. I'm afraid I can't do that."

// Enable this in the `.env.local` file to stream text to the console

const streamTextToConsole =
	process.env.CONSOLE_STREAM_OUTPUT === "true" ? true : false

// Create a completion stream from OpenAI and pipe it to the client
async function handleStoryRequest(
	client: WebSocket,
	state: StateType,
	payload: { prompt: string; genre: Genre },
) {
	const stream =
		await generateStory(payload.prompt, payload.genre)
	state.streaming_text = true

	// TODO: just put this in Fireproof instead so it's easy to sync locally
	// For now, we are just streaming the output to a file so we can show
	// past generations to users on the front page in a future version!

	const fileName = state.current_request_id
	const fullFileName = fileName + ".txt";
	const fullOutputFilename =
		process.cwd() + "/output/text/" + fullFileName;
	const dir = path.dirname(fullOutputFilename);

	console.info(CONSOLE_CATEGORY, `Writing text output to:\n${fullOutputFilename}`)


	// Ensure the directory exists
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}

	const localFile = createWriteStream(
		fullOutputFilename,
		{
			encoding: "utf-8",
		},
	)

	// Here we are streaming the output of the OpenAI completion to the client
	//  over the WebSocket connection as well as to the local filestream we
	//  created above. This will change in a future version to use Firestream

	for await (const chunk of stream) {
		const text = chunk.choices[0]?.delta?.content || ""
		const stop = chunk.choices[0]?.finish_reason

		if (text !== null) {
			sendTextMessage(client, { delta: text })
			localFile.write(text)
		}
		if (streamTextToConsole === true) {
			process.stdout.write(chunk.choices[0]?.delta?.content || "")
		}

		// When OpenAI gives us a stop signal, we wrap up the filestream
		// and send a state message to the client so they know to update their UI.
		// If you see the reason "length" in the console, it means the stream
		// was stopped because the maximum token length was reached.
		// This limitation is set by `OPENAI_MAX_TOKENS` in the .env file
		// if you'd like to increase it, but be aware that GPT-4 in
		// particular can get very expensive very quickly!

		if (stop) {
			state.streaming_text = false
			sendStateMessage(client, state)
			localFile.end()
			saveMetaData_storytime(fileName, payload)
			console.log(`Stream from OpenAI stopped with reason: ${stop}`)
		}
	}
}

// Request some images from the Livepeer text-to-image API

async function handleImageRequest_storytime(
	client: WebSocket,
	state: StateType,
	payload: RequestPayload_storytime,
) {
	const prompt = payload.prompt
	console.log(`Requesting images for prompt: ${prompt}`)
	const urls = await generateImages_storytime(prompt)
	sendImageMessage(client, { urls })
	saveImageURLs(state.current_request_id, urls)
}

async function wsConnection(connection: SocketStream, request: FastifyRequest) {
	const state = {
		streaming_audio: false,
		streaming_text: false,
		waiting_for_images: false,
		current_request_id: "",
		state_change_message: ""
	};

	// Use the `connection.socket` instead of `client`
	const client = connection.socket;

	sendStateMessage(client, state);
	console.log(`Client connected: ${request.ip}`);

	client.on("message", async (raw) => {
		const message = JSON.parse(raw.toString());
		if (message.type === "request") {
			const { prompt } = message.payload;
			state.current_request_id = `${Date.now()}-${crypto.randomUUID()}`;

			// Check if the prompt is flagged as harmful before
			//  passing the request to AI handlers
			const flagged = await isFlagged(prompt);
			if (flagged) {
				console.log(`User prompt was flagged as harmful: ${prompt}`);
				sendErrorMessage(client, {
					error: badPromptError,
				});
				return; // Exit
			}

			handleImageRequest_storytime(client, state, message.payload);
			handleStoryRequest(client, state, message.payload);
		}
	});
}

/**
 * This is the WebSocket controller for the Storytime app.
 *
 * @param {FastifyInstance} fastify - A valid Fastify
 *  instance.
 */
export default async function wsControllerForStoryTime(fastify: FastifyInstance) {
	await fastify.register(websocket)
	fastify.get("/storytime", { websocket: true }, wsConnection)
}
