# Bring-Your-Own Storage

## Usage

Install using either npm:

```bash
npm install @graffiti-garden/byo-storage
```

or in the browser, use jsdelivr or another CDN:

```html
<script type="module">
    import BYOStorage from 'https://cdn.jsdelivr.net/npm/@graffiti-garden/byo-storage';
</script>
```

Then go to the [Dropbox developer console](https://www.dropbox.com/developers/apps) and create an app.
Select "Full Dropbox" rather than "App Folder" - while this library only uses one folder, full access is necessary to enable link sharing.
Once created, add your app's domain to the "OAuth 2: Redirect URIs" section, as well as any local development URIs you may use.
Finally, copy the App key and use it to create a new BYOStorage instance:

```javascript
const byos = new BYOStorage({ clientId: 'YOUR_APP_KEY' });
```

## Testing

Go to the [Dropbox developer console](https://www.dropbox.com/developers/apps) and create a new, if you don't already have one. Then generate an access token and put it in the `.env` file:

```bash
ACCESS_TOKEN=DROPBOX_TOKEN_REDACTED
```

Then run the tests:

```bash
npm test
```

## TODO

- [ ] Have directories specific to a particular public key, and sign the shared links to those directories to prove that the data is from the correct source
- [ ] Add support for other storage providers
- [ ] Make posts immediately available without waiting for roundtrip
- [ ] Bundle posts together for faster loading
- [ ] Frequency based watching. When a lot of channels are being watched, poll active channels more frequently than inactive ones
