const RESOURCE_FIELDS = Object.freeze([
  'applicationIconPath', 'secondaryDisplayBackgroundPath', 'secondaryIdleMediaPath',
])

function createApplicationResourcePreview({ settingsStore }) {
  const preview = {}

  async function get() {
    return { ...await settingsStore.get(), resourcePreview: { ...preview } }
  }

  async function effective() {
    return { ...await settingsStore.get(), ...preview }
  }

  async function select(patch) {
    for (const field of RESOURCE_FIELDS) {
      if (Object.hasOwn(patch, field)) preview[field] = patch[field]
    }
    return get()
  }

  async function update(patch) {
    const submittedPreview = { ...preview }
    const settings = await settingsStore.update(patch)
    for (const field of RESOURCE_FIELDS) {
      if (Object.hasOwn(patch, field) && preview[field] === submittedPreview[field]) delete preview[field]
    }
    return { ...settings, resourcePreview: { ...preview } }
  }

  return { get, effective, select, update }
}

module.exports = { createApplicationResourcePreview, RESOURCE_FIELDS }
