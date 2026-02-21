// Main initialization
window.onload = () => {
  initMap();
  updateNodeList();
  setTimeout(drawStartupPipes, 300);
  startApiPolling();
};
