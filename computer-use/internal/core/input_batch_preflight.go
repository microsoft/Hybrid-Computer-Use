package core

// Windows text uses synchronous messages. Every earlier action that can queue
// input must acknowledge its receiver before a later text insertion or document
// replacement. Semantic-only routes complete without an input receipt.
func windowsAXInputAcknowledgements(actions []axBatchAction) []bool {
	required := make([]bool, len(actions))
	textFollows := false
	for index := len(actions) - 1; index >= 0; index-- {
		action := actions[index]
		switch action.actionType {
		case "click", "scroll", "keypress", "set_value":
			required[index] = textFollows
		}
		if action.actionType == "set_value" ||
			(action.actionType == "type" && action.text != "") {
			textFollows = true
		}
	}
	return required
}
