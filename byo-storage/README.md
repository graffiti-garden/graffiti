# Bring-Your-Own Storage

## Testing

Go to the [Dropbox developer console](https://www.dropbox.com/developers/apps) and create a new, if you don't already have one. Then generate an access token and put it in the `.env` file:

```bash
ACCESS_TOKEN=DROPBOX_TOKEN_REDACTED
```

Then run the tests:

```bash
npm test
```
