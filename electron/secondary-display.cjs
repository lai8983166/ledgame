function normalizeRectangle(value) {
  return {
    x: Number(value?.x) || 0,
    y: Number(value?.y) || 0,
    width: Math.max(0, Number(value?.width) || 0),
    height: Math.max(0, Number(value?.height) || 0),
  }
}

function describeDisplays(displays, primaryDisplay) {
  const primaryId = String(primaryDisplay?.id ?? '')
  return (Array.isArray(displays) ? displays : []).map((display, index) => {
    const bounds = normalizeRectangle(display?.bounds)
    const id = String(display?.id ?? '')
    return {
      id,
      label: String(display?.label || `Display ${index + 1}`),
      bounds,
      workArea: normalizeRectangle(display?.workArea ?? display?.bounds),
      scaleFactor: Number(display?.scaleFactor) || 1,
      primary: id === primaryId,
      selectable: id !== primaryId,
    }
  })
}

function toDisplaySelection(display) {
  if (!display || display.primary || !display.selectable) {
    return null
  }
  return {
    id: String(display.id),
    label: String(display.label || ''),
    bounds: normalizeRectangle(display.bounds),
  }
}

function sameBounds(left, right) {
  return (
    left?.x === right?.x &&
    left?.y === right?.y &&
    left?.width === right?.width &&
    left?.height === right?.height
  )
}

function matchSecondaryDisplay(descriptors, selection) {
  if (!selection) {
    return null
  }
  const candidates = (Array.isArray(descriptors) ? descriptors : []).filter(
    (display) => display.selectable && !display.primary,
  )
  const exact = candidates.find((display) => String(display.id) === String(selection.id))
  if (exact) {
    return exact
  }

  const labelAndBounds = candidates.filter(
    (display) =>
      selection.label &&
      display.label === selection.label &&
      sameBounds(display.bounds, selection.bounds),
  )
  if (labelAndBounds.length === 1) {
    return labelAndBounds[0]
  }

  const boundsOnly = candidates.filter((display) => sameBounds(display.bounds, selection.bounds))
  return boundsOnly.length === 1 ? boundsOnly[0] : null
}

function automaticSecondaryDisplay(descriptors, selection) {
  return matchSecondaryDisplay(descriptors, selection)
    || descriptors.find((display) => display.selectable && !display.primary)
    || descriptors.find((display) => display.primary)
    || null
}

function secondaryWindowPlacement(display) {
  if (!display) return null
  const area = normalizeRectangle(display.primary ? display.workArea ?? display.bounds : display.bounds)
  if (!area.width || !area.height) return null
  if (!display.primary) return { bounds: area, fullScreen: true }
  const width = Math.max(1, Math.floor(Math.min(1280, area.width * 0.8)))
  const height = Math.max(1, Math.floor(Math.min(720, area.height * 0.8)))
  return {
    bounds: {
      x: area.x + Math.floor((area.width - width) / 2),
      y: area.y + Math.floor((area.height - height) / 2),
      width,
      height,
    },
    fullScreen: false,
  }
}

module.exports = {
  describeDisplays,
  matchSecondaryDisplay,
  automaticSecondaryDisplay,
  secondaryWindowPlacement,
  toDisplaySelection,
}
