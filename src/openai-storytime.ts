import type { Genre, Prompt } from "./system/types"
import { createStorytimeSystemPrompt, genreList } from "./system/prompts"
import { chatCompletionStream } from "./openai-common"
import { OpenAIParams_text_completion } from "./openai-parameter-objects"

/**
 * Use the Storytime pipeline to create a story.
 *
 * @param {String} userPrompt - The prompt the user
 *  entered.
 * @param {String} genre - The genre of the story
 *  selected by the user.
 */
export async function generateStory(userPrompt: string, genre: Genre) {
	const params = new OpenAIParams_text_completion()
	
	console.log(
		`OpenAI settings: top_p=${params.top_p_param_val}, max_tokens=${params.max_tokens_param_val}, temperature=${params.temperature_param_val}, presence_penalty=${params.presence_penalty_param_val}, frequency_penalty=${params.frequency_penalty_param_val}`,
	)

	const genrePrompt = genreList[genre]
	const systemPrompt = createStorytimeSystemPrompt(
		genrePrompt.prompt,
		genrePrompt.caveat || "",
	)

	const textCompletionParams =
		new OpenAIParams_text_completion()

	return chatCompletionStream(systemPrompt, userPrompt, textCompletionParams)
}
