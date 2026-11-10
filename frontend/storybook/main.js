export default {
  stories: ['../src/components/**/*.stories.jsx'],
  addons: ['@storybook/addon-a11y', '@storybook/addon-docs'],
  framework: { name: '@storybook/react-vite', options: {} },
  core: { disableTelemetry: true },
  async viteFinal(config) {
    // Storybook contains no production API/auth configuration or customer data.
    return { ...config, envDir: '../output/handoff/empty-env', server: { ...config.server, host: '127.0.0.1' } };
  },
};
