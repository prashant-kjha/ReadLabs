import api from "./api";

export const getRecommendations = () =>
  api.get("/superpowers/recommendations").then((res) => res.data);
