import { modul } from '../module.js';
const { chalk } = modul;

export const color = (text, color) => {
    return !color ? chalk.green(text) : chalk.keyword(color)(text)
}

export const bgcolor = (text, bgcolor) => {
	return !bgcolor ? chalk.green(text) : chalk.bgKeyword(bgcolor)(text)
}
