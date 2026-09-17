import axios from "axios";

const axiosInterceptorInstance = axios.create({
  // baseURL: "http://127.0.0.1:3333/api/v1", // Replace with your API base URL
  baseURL: "https://api.ticketify.medianet.mv/api/v1", // Replace with your API base URL
});

// Request interceptor
axiosInterceptorInstance.interceptors.request.use(
  (config) => {
    // Modify the request config here (add headers, authentication tokens)
    // const accessToken = localStorage.getItem("access_token");

    // // If token is present add it to request's Authorization Header
    // if (accessToken) {
    //   if (config.headers)
    //     config.headers.Authorization = `Bearer ${accessToken}`;
    // }
    return config;
    // application/json

    // If the request is a POST request, add the content type header
    // if (config.method === "post") {
    //   if (config.headers) config.headers["Content-Type"] = "application/json";
  },
  (error) => {
    // Handle request errors here

    return Promise.reject(error);
  }
);
// End of Request interceptor

// Response interceptor
axiosInterceptorInstance.interceptors.response.use(
  (response) => {
    // Modify the response data here

    return response;
  },
  (error) => {
    // Handle response errors here

    console.error("Error from response interceptor: ", error);

    // If the error is due to expired token
    if (error.response && error.response.status === 401) {
      // Redirect to login page
      window.location.href = "/auth/login";
    }

    return Promise.reject(error);
  }
);
// End of Response interceptor

export default axiosInterceptorInstance;
