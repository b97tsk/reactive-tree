export default {
    input: 'build/index.js',
    external: [
        'rxjs',
        'rxjs/operators'
    ],
    output: {
        file: 'main.js',
        format: 'cjs'
    }
};
