var gulp = require('gulp');
var shell = require('gulp-shell')

gulp.task('default', shell.task([
  // Absolute path '/usr/local/lib/node_modules/electron-prebuilt/dist/Electron.app/Contents/MacOS/Electron .'
  // Run electron
  'node_modules/electron-prebuilt/dist/Electron.app/Contents/MacOS/Electron .'
]));
