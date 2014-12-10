# assets-vendor

3rd party utility libraries here. They must be of sufficient high quality to be included here and offer common functionality.

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

Behance maintains our own version of FineUploader to introduce a number of necessary features/patches
that are too far out in the FineUploader roadmap.

We currently maintain a patched version of the unminified, built file: fineuploader.js. In the near future,
we will have a proper fork with build instructions to follow.

Pre-fork instructions:

1. Make your modifications in fineuploader.js
2. Comment on change with a `BEHANCE:` prefix
