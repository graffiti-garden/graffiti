TODO:

# Robustness

- [ ] Make a login interface that merges actor management and storage management.
- [ ] Support rapid posting and then deletion.
- [ ] When a link from the link service is deleted (e.g. when all elements of someone's dropbox are moved), make sure that cached data with that link is also deleted and not shown in results.

  - When a subscription backlog complete occurs, check the received links against those drawn from the cache and get rid of overlap.
  - This may not be necessary if the link service uses a cursor.
  - [ ] Add public key to signing inputs so the actor manager doesn't accidentally sign a message for the wrong public key if the user logs in with a different key while something is being posted.

- [ ] Post from multiple contexts
- [ ] Interpret data as JSON and use proxies for updating
- [ ] Vue?
- [ ] Salt shared links so they can be moved. Note that if the link changes, the cursor should reset...?

# Long term

- [ ] Use a cursor for the link service
- [ ] Add support for other storage providers
- [ ] Allow user to simultaneously use multiple storage providers.
