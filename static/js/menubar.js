function resolveFileType (fileType) {
  switch (fileType) {
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'tif':
      fileType = 'image'
      break
    case 'docx':
    case 'rtf':
    case 'doc':

      fileType = 'word'
      break
    case 'html':
    case 'js':
    case 'css':
    case 'c':
    case 'cpp':
    case 'py':
    case 'ruby':
    case 'java':

      fileType = 'code'
      break
    case 'mp4':
    case 'mkv':
    case 'flv':
      fileType = 'video'
      break
    case 'mp4':
    case 'mkv':
    case 'flv':
    case 'doc':
    case 'gdoc':
      fileType = 'word'
      break
    case 'ppt':
      fileType = 'powerpoint'
      break
    case 'ai':
    case 'psd':
    case 'flv':
      fileType = 'vector'
      break
    case 'mp3':
    case 'flac':
    case 'wav':
      fileType = 'audio'
      break
    case 'tar':
    case 'zip':
    case 'gz':
      fileType = 'vector'
      break
    case 'tar':
    case 'zip':
    case 'gz':
      fileType = 'zip'
      break
    case 'pdf':
      fileType = 'pdf'
      break
    case 'XLS':
    case 'XLSM':
    case 'XLSX':
      fileType = 'excel'
      break
    default:
      fileType = 'file'
  }
  return fileType
}
