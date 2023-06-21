from jsonschema import Draft7Validator

schema = {
    "type": "object",
    "properties": {
        "messageID": { "$ref": "#/definitions/sha256" },
        "action": {
            "enum": ["announce", "unannounce", "subscribe", "unsubscribe"]
        },
        "info_hashes": {
            "type": "array",
            "minItems": 1,
            "uniqueItems": True,
            "items": { "$ref": "#/definitions/sha256" },
        }
    },
    "required": ["messageID", "action", "info_hashes"],
    "additionalProperties": False,
    "definitions": {
        "sha256": {
            "type": "string",
            "pattern": "^[0-9a-f]{64}$"
        }
    }
}

validator = Draft7Validator(schema)
validate = lambda msg: validator.validate(msg)