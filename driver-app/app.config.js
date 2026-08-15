// app.json stays the source of truth; this file exists only to let the one
// value that cannot be static come from the environment.
//
// google-services.json is gitignored, so it is not in the archive EAS builds
// from. EAS writes the GOOGLE_SERVICES_JSON file variable to a path on the
// builder and hands us that path — a static app.json has no way to read it.
// Locally the variable is unset and the committed relative path is used.
module.exports = ({ config }) => ({
    ...config,
    android: {
        ...config.android,
        googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? './google-services.json',
    },
});
