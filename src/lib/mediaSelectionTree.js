export function filterMediaTree(nodes, accept = 'any') {
  return (nodes || []).flatMap(node => {
    if (node.kind === 'directory') {
      const children = filterMediaTree(node.children, accept);
      return children.length ? [{...node, children}] : [];
    }
    const matches = node.mediaType === accept
      || (accept === 'gif' && node.mediaType === 'image' && /\.gif$/i.test(node.relativePath))
      || (accept === 'visual' && ['image', 'video'].includes(node.mediaType))
      || (accept === 'any' && ['image', 'audio', 'video'].includes(node.mediaType));
    return node.kind === 'file' && matches ? [node] : [];
  });
}

export function visibleMediaRows(nodes, expanded, depth = 0) {
  return (nodes || []).flatMap(node => [
    {...node, depth},
    ...(node.kind === 'directory' && expanded.has(node.relativePath)
      ? visibleMediaRows(node.children, expanded, depth + 1) : []),
  ]);
}
