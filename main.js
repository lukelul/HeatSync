// Main initialization
window.onload = () => {
  initMap();
  updateNodeList();
  setTimeout(drawStartupPipes, 300);
  setInterval(refreshTemps, 1000);
};
