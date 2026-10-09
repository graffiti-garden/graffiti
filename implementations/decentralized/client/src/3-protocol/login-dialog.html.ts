export const template = `<template id="graffiti-login-welcome">
  <h1>
    <a target="_blank" href="https://graffiti.garden">Graffiti Log&nbsp;In</a>
  </h1>

  <ul>
    <li><a type="button" id="graffiti-login-new">Create&nbsp;new Graffiti&nbsp;identity</a></li>
    <li><button class="secondary" id="graffiti-login-existing">Use&nbsp;existing Graffiti&nbsp;identity</button></li>
  </ul>

  <aside>
    This application is built with
    <a target="_blank" href="https://graffiti.garden">Graffiti</a>.
  </aside>
</template>

<template id="graffiti-login-handle">
<h1>
  <a target="_blank" href="https://graffiti.garden">Graffiti Log&nbsp;In</a>
</h1>

  <form id="graffiti-login-handle-form">
    <label for="username">Graffiti handle:</label>
    <input
      type="text"
      name="username"
      id="username"
      autocomplete="username"
      autocapitalize="none"
      spellcheck="false"
      inputmode="url"
      placeholder="you.graffiti.actor"
      required
    >
    <button id="graffiti-login-handle-submit" type="submit">
      Log In
    </button>
  </form>

  <div style="display: grid; gap: 0.5em">
    <p><a href="#" id="graffiti-login-forgot">Forgot your handle?</a></p>
    <p>Don't&nbsp;have&nbsp;a Graffiti&nbsp;handle? <a id="graffiti-login-new">Create&nbsp;one</a>.</p>
  </div>
</template>

<template id="graffiti-login-provider">
  <h1>
    <a target="_blank" href="https://graffiti.garden">Graffiti Log&nbsp;In</a>
  </h1>

  <form id="graffiti-login-provider-form">
    <label for="graffiti-provider">Where did you create your Graffiti account?</label>
    <input id="graffiti-provider" type="text" autocapitalize="none" spellcheck="false" required>
    <button type="submit">Continue to provider</button>
  </form>
  <p><a href="#" id="graffiti-login-provider-back">← Back</a></p>
</template>`;
