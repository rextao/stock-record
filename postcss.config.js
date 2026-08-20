// postcss.config.js
export default {
    plugins: {
        'postcss-px-to-viewport-8-plugin': {
            viewportWidth: 375, // 设计稿宽度
            unitPrecision: 5,
            viewportUnit: 'vw',
            selectorBlackList: ['ignore-vw'], // 不需要转换的类名
            minPixelValue: 1,
            mediaQuery: false,
        },
    },
};
