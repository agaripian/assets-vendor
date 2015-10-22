# assets-vendor

3rd party utility libraries here. They must be of sufficient high quality to be included here and offer common functionality.

### Cutting a Release

1. `npm version <version number>`
1. `git push upstream master --follow-tags`
1. Edit the release notes at https://github.com/behance/assets-vendor/releases

## Updating ckeditor

Behance maintains several CKEditor plugins in the behance/ckeditor-dev repo. In order to update to the latest CKEditor, perform the following steps:

1. clone the behance/ckeditor-dev repo.
1. merge the latest changes from ckeditor/ckeditor-dev into the behance/ckeditor-dev repo.
1. from behance/ckeditor-dev, run `./dev/builder/build.sh`.
1. copy `./dev/builder/release/ckeditor/` from behance/ckeditor-dev to the `ckeditor` dir in this repo.
1. ensure implementations behave as expected. For the network this includes, at a minimum:
  1. posting a job
  1. adding text to a project from the project editor

## Updating FineUploader

Behance maintains our own version of FineUploader in the behance/fine-uploader repo. In order to update to the latest FineUploader, or to generate a new build, perform the following steps:

1. follow the instructions on http://docs.fineuploader.com/contributing.html
1. copy the correct files to this repo. As of 5/20/15 that is both the regular fine-uploader.min.js file and the s3.fine-uploader.min.js
1. Ensure that Behance's custom changes are in place by grepping the code for comments starting with `BEHANCE:`
1. Add AMD wrappers around the code to avoid having conflicting globals.

Future modifications to FineUploader should be done as pull requests against the behance/fine-uploader repo.
