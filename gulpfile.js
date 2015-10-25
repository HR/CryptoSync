var gulp = require('gulp'),
    shell = require('gulp-shell');

gulp.task('default', shell.task([
  // Absolute path '/usr/local/lib/node_modules/electron-prebuilt/dist/Electron.app/Contents/MacOS/Electron .'
  // Run electron
  'node_modules/electron-prebuilt/dist/Electron.app/Contents/MacOS/Electron .'
]));

gulp.task('watch', function() {
  gulp.watch(['./static/**/*', './*.js'], ['run']);
});

gulp.task('run', function(){
  return gulp.src('*', {read: false})
   .pipe(shell([
    // start electron main and render process
    'node_modules/electron-prebuilt/dist/Electron.app/Contents/MacOS/Electron .'
   ]))
});

gulp.task('default', ['watch', 'run']);
