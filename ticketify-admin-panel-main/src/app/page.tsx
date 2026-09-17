"use client";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import axiosInterceptorInstance from "@/lib/axios-interceptor";
import GoogleMap from "google-maps-react-markers";
import moment from "moment";
import React from "react";
import { mapStyles } from "./mapStyles";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Search,
  Menu,
  X,
  Clock,
  User,
  Star,
  Ticket,
  TrendingUp,
  Phone,
  Mail,
  Calendar,
  Play,
  Pause,
  RotateCcw,
  MapPin,
} from "lucide-react";

export default function HomePage() {
  // CSS styles for the custom range slider
  React.useEffect(() => {
    const style = document.createElement("style");
    style.textContent = `
      .slider::-webkit-slider-thumb {
        appearance: none;
        height: 16px;
        width: 16px;
        background: #3b82f6;
        border-radius: 50%;
        cursor: pointer;
        border: 2px solid white;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
      }
      
      .slider::-moz-range-thumb {
        height: 16px;
        width: 16px;
        background: #3b82f6;
        border-radius: 50%;
        cursor: pointer;
        border: 2px solid white;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
      }
      
      .slider::-webkit-slider-track {
        height: 8px;
        border-radius: 4px;
      }
      
      .slider::-moz-range-track {
        height: 8px;
        border-radius: 4px;
      }
    `;
    document.head.appendChild(style);

    return () => {
      document.head.removeChild(style);
    };
  }, []);
  let [technicians, setTechnicians] = React.useState<any>([]);
  let route = useRouter();
  let [tickets, setTickets] = React.useState<any>([]);
  const mapRef = React.useRef<any>(null);
  const [mapReady, setMapReady] = React.useState(false);
  let [hoveredTechnician, setHoveredTechnician] = React.useState<any>(null);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [selectedTechnicianDetails, setSelectedTechnicianDetails] =
    React.useState<any>(null);
  const [isLoadingDetails, setIsLoadingDetails] = React.useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = React.useState(false);
  const [selectedTechnicianId, setSelectedTechnicianId] = React.useState<
    string | null
  >(null);
  const [activeTab, setActiveTab] = React.useState<"requests" | "feedbacks">(
    "requests"
  );
  const [isAnimatingPath, setIsAnimatingPath] = React.useState(false);
  const [animationIndex, setAnimationIndex] = React.useState(0);
  const [pathAnimationInterval, setPathAnimationInterval] =
    React.useState<NodeJS.Timeout | null>(null);
  const [isPathPlaying, setIsPathPlaying] = React.useState(false);

  function fetchTickets() {
    if (!localStorage.getItem("access_token")) {
      route.push("/auth/login");
      return;
    }
    axiosInterceptorInstance
      .get("/tickets/all", {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("access_token")}`,
        },
      })
      .then((response) => {
        console.log(response);
        setTickets(response.data);
      });
  }

  React.useEffect(() => {
    fetchTickets();

    const interval = setInterval(() => {
      fetchTickets();
    }, 300000);
    return () => clearInterval(interval);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const Marker = ({
    lat,
    lng,
    technician,
    markerId,
  }: {
    lat: number;
    lng: number;
    technician: any;
    markerId: string;
  }) => {
    return (
      <div className="relative group">
        <div
          onClick={() => {
            onMarkerClick(null, { lat, lng, markerId: technician.id });
            fetchTechnicianDetails(technician.id);
          }}
          onMouseEnter={() => setHoveredTechnician(technician)}
          onMouseLeave={() => setHoveredTechnician(null)}
          className="w-12 h-12 rounded-full border-4 border-white shadow-lg cursor-pointer hover:scale-110 transition-all duration-200 flex items-center justify-center"
          style={{
            backgroundColor:
              technician?.availability === true ? "#10b981" : "#dc2626",
          }}
        >
          <User className="w-5 h-5 text-white" />
        </div>
        {technician?.availability && (
          <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-white apple-pulse"></div>
        )}

        {/* Hover Tooltip */}
        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-1 bg-black/90 text-white text-sm rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-10">
          {technician.name}
          <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-black/90"></div>
        </div>
      </div>
    );
  };

  function fetchTechnicians() {
    axiosInterceptorInstance
      .get("/users/technicians", {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("access_token")}`,
        },
      })
      .then((response) => {
        console.log(response);
        setTechnicians(response.data); // Access the 'data' property of the response object
      });
  }

  const onGoogleApiLoaded = ({ map, maps }: { map: any; maps: any }) => {
    mapRef.current = map;
    setMapReady(true);
  };

  const fetchTechnicianDetails = async (technicianId: string) => {
    setIsLoadingDetails(true);
    setIsDrawerOpen(true);
    setSelectedTechnicianId(technicianId);
    try {
      const response = await axiosInterceptorInstance.get(
        `/users/technician/${technicianId}/details`,
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("access_token")}`,
          },
        }
      );
      setSelectedTechnicianDetails(response.data);
    } catch (error) {
      console.error("Failed to fetch technician details:", error);
    } finally {
      setIsLoadingDetails(false);
    }
  };

  const closeDrawer = () => {
    setIsDrawerOpen(false);
    setSelectedTechnicianDetails(null);
    setSelectedTechnicianId(null);
    // Stop any running animation
    if (pathAnimationInterval) {
      clearInterval(pathAnimationInterval);
      setPathAnimationInterval(null);
    }
    setIsAnimatingPath(false);
    setIsPathPlaying(false);
    setAnimationIndex(0);
  };

  const startPathAnimation = () => {
    if (!selectedTechnicianDetails?.locationTracking?.last8Hours?.length)
      return;

    const locations = selectedTechnicianDetails.locationTracking.last8Hours;
    setIsAnimatingPath(true);
    setIsPathPlaying(true);

    // If starting from beginning, set to 0, otherwise continue from current index
    if (animationIndex === 0) {
      setAnimationIndex(0);
    }

    // Focus map on the current location (reverse chronological order - start from oldest)
    const chronologicalIndex = locations.length - 1 - animationIndex;
    const currentLocation = locations[chronologicalIndex];
    if (currentLocation && mapRef.current) {
      mapRef.current.panTo({
        lat: currentLocation.latitude,
        lng: currentLocation.longitude,
      });
      mapRef.current.setZoom(17);
    }

    const interval = setInterval(() => {
      setAnimationIndex((prevIndex) => {
        const nextIndex = prevIndex + 1;
        if (nextIndex >= locations.length) {
          // Animation complete
          clearInterval(interval);
          setPathAnimationInterval(null);
          setIsPathPlaying(false);
          return prevIndex;
        }

        // Pan map to current location (reverse chronological order)
        if (mapRef.current) {
          const chronologicalIndex = locations.length - 1 - nextIndex;
          mapRef.current.panTo({
            lat: locations[chronologicalIndex].latitude,
            lng: locations[chronologicalIndex].longitude,
          });
        }

        return nextIndex;
      });
    }, 1000); // 1 second between each waypoint

    setPathAnimationInterval(interval);
  };

  const stopPathAnimation = () => {
    if (pathAnimationInterval) {
      clearInterval(pathAnimationInterval);
      setPathAnimationInterval(null);
    }
    setIsPathPlaying(false);
  };

  const pausePathAnimation = () => {
    if (pathAnimationInterval) {
      clearInterval(pathAnimationInterval);
      setPathAnimationInterval(null);
    }
    setIsPathPlaying(false);
  };

  const resetPathAnimation = () => {
    stopPathAnimation();
    setAnimationIndex(0);
    setIsAnimatingPath(false);
    // Return to technician's current location
    if (
      selectedTechnicianDetails?.locationTracking?.currentLocation &&
      mapRef.current
    ) {
      mapRef.current.setZoom(17);
    }
  };

  const handleTimelineSeek = (newIndex: number) => {
    if (!selectedTechnicianDetails?.locationTracking?.last8Hours?.length)
      return;

    const locations = selectedTechnicianDetails.locationTracking.last8Hours;
    if (newIndex >= 0 && newIndex < locations.length) {
      setAnimationIndex(newIndex);

      // Pan map to the selected location (reverse chronological order)
      const chronologicalIndex = locations.length - 1 - newIndex;
      const selectedLocation = locations[chronologicalIndex];
      if (selectedLocation && mapRef.current) {
        mapRef.current.panTo({
          lat: selectedLocation.latitude,
          lng: selectedLocation.longitude,
        });
      }
    }
  };

  const onMarkerClick = (
    e: null,
    { markerId, lat, lng }: { markerId: number; lat: number; lng: number }
  ) => {
    console.log("Focusing on technician ->", markerId);

    if (mapRef.current) {
      // Smoothly animate to the technician's location with zoom
      mapRef.current.panTo({ lat, lng });

      // Set zoom level to focus on the technician (higher number = closer zoom)
      mapRef.current.setZoom(17);

      // Alternative: Use a smooth zoom animation
      // mapRef.current.smoothZoom?.(17);
    }
  };

  React.useEffect(() => {
    fetchTechnicians();

    const interval = setInterval(() => {
      fetchTechnicians();
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  const filteredTechnicians = technicians.filter(
    (tech: any) =>
      tech.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tech.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="h-screen bg-background relative">
      {/* Fixed Top Sidebar with Glassmorphism */}
      <div
        className={`fixed top-0 left-0 right-4 z-50 backdrop-blur-md lg:w-[calc(100vw/4)] w-[calc(100vw-24px)]  mt-2 lg:mx-2 mx-4 rounded-xl bg-black/20 border-b border-white/10
            ${
              isMobileSidebarOpen
                ? "h-[calc(100vh-30px)]"
                : "h-20 lg:h-[calc(100vh-30px)] "
            }
          `}
      >
        <div className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h1 className="lg:text-xl text-lg font-semibold text-white">
              Ticketify Workforce Tracker
            </h1>
            <button
              className="lg:hidden p-2 hover:bg-white/10 rounded-xl transition-colors"
              onClick={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
            >
              {isMobileSidebarOpen ? (
                <X className="w-5 h-5 text-white" />
              ) : (
                <Menu className="w-5 h-5 text-white" />
              )}
            </button>
          </div>

          <div
            className={`${isMobileSidebarOpen ? "block" : "lg:block hidden"}`}
          >
            {/* Search Bar */}
            <div className="flex items-center gap-4">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Search technicians..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 text-sm pr-4 py-2.5 w-full bg-white/10 backdrop-blur-sm rounded-xl border border-white/20 focus:outline-none focus:ring-2 focus:ring-white/30 focus:border-white/30 transition-all text-white placeholder-gray-400"
                />
              </div>
            </div>
            <div className="text-xs pt-4 text-gray-300 whitespace-nowrap">
              {filteredTechnicians.filter((t: any) => t.availability).length} of{" "}
              {filteredTechnicians.length} available
            </div>

            {/* Technicians List */}
            <div
              className={`mt-4 transition-all duration-300 overflow-x-auto overflow-y-auto ease-in-out ${
                isMobileSidebarOpen
                  ? "h-[calc(100vh-220px)] lg:h-[calc(100vh-200px)]"
                  : "h-0 lg:h-[calc(100vh-200px)]"
              }`}
            >
              <div className="apple-scrollbar o ">
                <div className="flex flex-col gap-3 pb-2">
                  {filteredTechnicians?.map((technician: any) => (
                    <ContextMenu key={technician.phone}>
                      <ContextMenuTrigger>
                        <div
                          onClick={() => {
                            if (technician?.user_location_tracking?.[0]) {
                              onMarkerClick(null, {
                                lat: technician.user_location_tracking[0]
                                  .latitude,
                                lng: technician.user_location_tracking[0]
                                  .longitude,
                                markerId: technician.id,
                              });
                              setHoveredTechnician(technician);
                              fetchTechnicianDetails(technician.id);
                            }
                            setIsMobileSidebarOpen(false);
                          }}
                          onMouseEnter={() => setHoveredTechnician(technician)}
                          onMouseLeave={() => setHoveredTechnician(null)}
                          className={`bg-white/10 backdrop-blur-sm hover:bg-white/20 border border-white/20 rounded-xl p-3 cursor-pointer transition-all duration-200 lg:min-w-[240px] min-w-full ${
                            hoveredTechnician?.id === technician.id
                              ? "ring-2 ring-white/30 bg-white/20"
                              : ""
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="relative flex-shrink-0">
                              <div
                                className="w-10 h-10 rounded-full flex items-center justify-center shadow-sm"
                                style={{
                                  backgroundColor:
                                    technician?.availability === true
                                      ? "#10b981"
                                      : "#dc2626",
                                }}
                              >
                                <User className="w-5 h-5 text-white" />
                              </div>
                              {technician?.availability && (
                                <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-white apple-pulse"></div>
                              )}
                            </div>

                            <div className="flex-1 min-w-0">
                              <h3 className="font-medium text-white truncate text-sm">
                                {technician.name}
                              </h3>
                              <p className="text-xs text-gray-300 truncate">
                                {technician.email}
                              </p>
                              <div className="flex items-center gap-1 mt-1">
                                <div
                                  className={`w-2 h-2 rounded-full ${
                                    technician?.availability
                                      ? "bg-green-400"
                                      : "bg-red-400"
                                  }`}
                                ></div>
                                <span
                                  className={`text-xs ${
                                    technician?.availability
                                      ? "text-green-400"
                                      : "text-red-400"
                                  }`}
                                >
                                  {technician?.availability
                                    ? "Available"
                                    : "Offline"}
                                </span>
                              </div>
                            </div>

                            <div className="text-xs text-gray-400 flex-shrink-0">
                              {technician?.user_location_tracking?.[0]
                                ? moment(
                                    technician.user_location_tracking[0]
                                      .created_at
                                  ).fromNow()
                                : "No location"}
                            </div>
                          </div>
                        </div>
                      </ContextMenuTrigger>
                      <ContextMenuContent className="bg-black/80 backdrop-blur-xl border-white/20">
                        <ContextMenuItem className="cursor-pointer text-white hover:bg-white/10">
                          View Tasks
                        </ContextMenuItem>
                        <ContextMenuItem className="cursor-pointer text-white hover:bg-white/10">
                          Assign Ticket
                        </ContextMenuItem>
                      </ContextMenuContent>
                    </ContextMenu>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Admin Panel Access */}
      <div className="h-20 z-50 absolute bottom-0   md:right-0 md:top-0 flex items-center gap-3 px-4">
        <a
          href="/admin"
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium flex items-center gap-2"
        >
          <div className="w-4 h-4">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.397.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.273-.806.108-1.204-.165-.397-.505-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.107-1.204l-.527-.738a1.125 1.125 0 01.12-1.45l.773-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          </div>
          Admin Panel
        </a>
        <button className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors text-sm font-medium">
          Logout
        </button>
      </div>

      {/* Full Width Map */}
      <div className="h-screen w-full" style={{ touchAction: "none" }}>
        <GoogleMap
          style={{ height: "100vh", width: "100vw" }}
          apiKey="AIzaSyCYBlF9CilcGol6Nmh3fc_avgW6N6N6BjQ"
          options={{
            fullscreenControl: false,
            controlSize: 28,
            styles: mapStyles,
            zoomControl: true,
            mapTypeControl: false,
            streetViewControl: false,
          }}
          defaultCenter={{ lat: 4.1752, lng: 73.5095 }}
          defaultZoom={13}
          onGoogleApiLoaded={onGoogleApiLoaded}
          onChange={(map) => console.log("Map moved", map)}
        >
          {/* Regular technician markers - hidden during path animation */}
          {!isAnimatingPath &&
            filteredTechnicians
              ?.filter(
                (technician: any) =>
                  technician?.user_location_tracking?.length > 0 &&
                  (selectedTechnicianId
                    ? technician.id === selectedTechnicianId
                    : true)
              )
              ?.map((technician: any) => (
                <Marker
                  key={technician.id}
                  lat={technician.user_location_tracking[0].latitude}
                  lng={technician.user_location_tracking[0].longitude}
                  technician={technician}
                  markerId={technician?.id ?? ""}
                />
              ))}

          {/* Animated path waypoints */}
          {isAnimatingPath &&
            selectedTechnicianDetails?.locationTracking?.last8Hours &&
            selectedTechnicianDetails.locationTracking.last8Hours
              .slice()
              .reverse()
              .slice(0, animationIndex + 1)
              .map((location: any, index: number) => {
                const isCurrentWaypoint = index === animationIndex;
                const isStartWaypoint = index === 0;
                const isEndWaypoint =
                  index === animationIndex &&
                  animationIndex ===
                    selectedTechnicianDetails.locationTracking.last8Hours
                      .length -
                      1;

                return (
                  <div
                    key={`waypoint-${index}`}
                    style={{
                      position: "absolute",
                      transform: "translate(-50%, -50%)",
                    }}
                  >
                    <div
                      className={`flex items-center justify-center rounded-full border-2 border-white shadow-lg transition-all duration-500 ${
                        isCurrentWaypoint
                          ? "w-4 h-4 bg-red-500 animate-pulse"
                          : "w-3 h-3 bg-blue-500"
                      }`}
                    >
                      {isCurrentWaypoint && (
                        <div className="absolute inset-0 rounded-full bg-red-500 animate-ping"></div>
                      )}
                    </div>
                    {isStartWaypoint && (
                      <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 px-2 py-1 bg-green-600 text-white text-xs rounded whitespace-nowrap">
                        Start (Past)
                      </div>
                    )}
                    {isEndWaypoint && (
                      <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 px-2 py-1 bg-red-600 text-white text-xs rounded whitespace-nowrap">
                        Current (Now)
                      </div>
                    )}
                  </div>
                );
              })}
        </GoogleMap>
      </div>

      {/* Floating Timeline Controls (Both Mobile & Desktop when path is playing) */}
      {isDrawerOpen && isPathPlaying && (
        <div className="fixed bottom-4 left-4 right-4 lg:left-auto lg:right-4 lg:w-96 z-50">
          <div className="bg-black/30 backdrop-blur-md rounded-xl p-4 border border-white/10">
            {/* Mini Header */}
            <div className="flex items-center gap-3 mb-3">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{
                  backgroundColor:
                    selectedTechnicianDetails?.user?.availability === true
                      ? "#10b981"
                      : "#dc2626",
                }}
              >
                <User className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-white truncate text-sm">
                  {selectedTechnicianDetails?.user?.name}
                </h3>
                <p className="text-xs text-gray-400 truncate">Path Animation</p>
              </div>
              <button
                onClick={closeDrawer}
                className="p-1 hover:bg-white/10 rounded-lg transition-colors"
              >
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>

            {/* Timeline Controls */}
            <div className="space-y-3">
              {/* Time Display */}
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-400">
                  {selectedTechnicianDetails?.locationTracking?.last8Hours &&
                    moment(
                      selectedTechnicianDetails.locationTracking.last8Hours[
                        selectedTechnicianDetails.locationTracking.last8Hours
                          .length - 1
                      ]?.created_at
                    ).format("HH:mm:ss")}
                </span>
                <span className="text-white font-medium">
                  {selectedTechnicianDetails?.locationTracking?.last8Hours &&
                    moment(
                      selectedTechnicianDetails.locationTracking.last8Hours[
                        selectedTechnicianDetails.locationTracking.last8Hours
                          .length -
                          1 -
                          animationIndex
                      ]?.created_at
                    ).format("HH:mm:ss")}
                </span>
                <span className="text-gray-400">
                  {selectedTechnicianDetails?.locationTracking?.last8Hours &&
                    moment(
                      selectedTechnicianDetails.locationTracking.last8Hours[0]
                        ?.created_at
                    ).format("HH:mm:ss")}
                </span>
              </div>

              {/* Progress Slider */}
              <div className="relative">
                <input
                  type="range"
                  min={0}
                  max={
                    selectedTechnicianDetails?.locationTracking?.last8Hours
                      ?.length - 1 || 0
                  }
                  value={animationIndex}
                  onChange={(e) => handleTimelineSeek(parseInt(e.target.value))}
                  className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer slider"
                  style={{
                    background: selectedTechnicianDetails?.locationTracking
                      ?.last8Hours
                      ? `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${
                          (animationIndex /
                            (selectedTechnicianDetails.locationTracking
                              .last8Hours.length -
                              1)) *
                          100
                        }%, #4b5563 ${
                          (animationIndex /
                            (selectedTechnicianDetails.locationTracking
                              .last8Hours.length -
                              1)) *
                          100
                        }%, #4b5563 100%)`
                      : "#4b5563",
                  }}
                />
              </div>

              {/* Controls */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    onClick={pausePathAnimation}
                    className="flex items-center gap-2 px-3 py-2 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 rounded-lg transition-colors text-sm"
                  >
                    <Pause className="w-4 h-4" />
                    Pause
                  </button>
                  <button
                    onClick={resetPathAnimation}
                    className="flex items-center gap-2 px-2 py-2 bg-gray-500/20 hover:bg-gray-500/30 text-gray-400 rounded-lg transition-colors"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                </div>
                <span className="text-xs text-gray-400">
                  {animationIndex + 1}/
                  {selectedTechnicianDetails?.locationTracking?.last8Hours
                    ?.length || 0}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Desktop: View Details Button (when floating controls are active) */}
      {isDrawerOpen && isPathPlaying && (
        <div className="hidden lg:block fixed bottom-4 left-4 z-50">
          <button
            onClick={() => setIsPathPlaying(false)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded-lg transition-colors text-sm border border-blue-500/30 backdrop-blur-md"
          >
            <User className="w-4 h-4" />
            View Details
          </button>
        </div>
      )}

      {/* Desktop & Mobile Drawer (Hidden when path is playing on all devices) */}
      {isDrawerOpen && !isPathPlaying && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 transition-opacity"
            onClick={closeDrawer}
          ></div>

          {/* Drawer */}
          <div
            className={`fixed bg-black/20 m-4 rounded-xl backdrop-blur-md shadow-2xl transform transition-transform duration-300 ease-in-out
              lg:right-0 lg:top-0 lg:bottom-0 lg:w-96 lg:border-l lg:border-white/10 
              inset-0 lg:inset-auto 
              ${
                isDrawerOpen
                  ? "lg:translate-x-0 translate-x-0"
                  : "lg:translate-x-full translate-x-full"
              }
            `}
          >
            {/* Header */}

            {/* Content */}
            <div className="overflow-y-auto h-[calc(100vh-64px)] p-4">
              <button
                onClick={closeDrawer}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors absolute top-4 right-4"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
              {isLoadingDetails ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
                </div>
              ) : selectedTechnicianDetails ? (
                <div className="space-y-6">
                  {/* Header */}
                  <div className="flex items-center gap-4">
                    <div
                      className="w-16 h-16 rounded-full flex items-center justify-center"
                      style={{
                        backgroundColor:
                          selectedTechnicianDetails.user?.availability === true
                            ? "#10b981"
                            : "#dc2626",
                      }}
                    >
                      <User className="w-8 h-8 text-white" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-bold text-white ">
                        {selectedTechnicianDetails.user.name}
                      </h3>
                      <p className="text-gray-400 text-xs">
                        {selectedTechnicianDetails.user.role?.name ||
                          "Technician"}
                      </p>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <Star
                                key={star}
                                className={`w-3 h-3 ${
                                  star <=
                                  Math.round(
                                    selectedTechnicianDetails.ratings
                                      .averageRating
                                  )
                                    ? "text-yellow-400 fill-current"
                                    : "text-gray-400"
                                }`}
                              />
                            ))}
                          </div>
                          <span className="text-sm  text-white">
                            {selectedTechnicianDetails.ratings.averageRating.toFixed(
                              1
                            )}{" "}
                            ({selectedTechnicianDetails.ratings.totalFeedbacks})
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ">
                        <div
                          className={`w-2 h-2 rounded-full ${
                            selectedTechnicianDetails.user?.availability
                              ? "bg-green-400"
                              : "bg-red-400"
                          }`}
                        ></div>
                        <span
                          className={`text-xs ${
                            selectedTechnicianDetails.user?.availability
                              ? "text-green-400"
                              : "text-red-400"
                          }`}
                        >
                          {selectedTechnicianDetails.user?.availability
                            ? "Available"
                            : "Offline"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Contact Info */}
                  <div className="space-y-3 bg-white/5 rounded-xl p-4">
                    <div className="space-y-2">
                      <div className="flex items-center gap-3 text-gray-300">
                        <Mail className="w-4 h-4 text-gray-400" />
                        <span className="text-sm">
                          {selectedTechnicianDetails.user.email}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-gray-300">
                        <Phone className="w-4 h-4 text-gray-400" />
                        <span className="text-sm">
                          {selectedTechnicianDetails.user.phone}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-gray-300">
                        <Calendar className="w-4 h-4 text-gray-400" />
                        <span className="text-sm">
                          Joined{" "}
                          {moment(
                            selectedTechnicianDetails.user.created_at
                          ).format("MMM YYYY")}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Service Tickets Stats */}
                  <div className="space-y-3">
                    <h4 className="text-white font-medium flex items-center gap-2">
                      <Ticket className="w-4 h-4" />
                      Service Tickets (
                      {selectedTechnicianDetails.serviceTickets.total})
                    </h4>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-blue-500/20 rounded-xl p-3 border border-blue-500/30">
                        <div className="text-blue-400 text-xs font-medium uppercase tracking-wide">
                          New
                        </div>
                        <div className="text-xl font-bold text-blue-400 mt-1">
                          {selectedTechnicianDetails.serviceTickets.new}
                        </div>
                      </div>
                      <div className="bg-yellow-500/20 rounded-xl p-3 border border-yellow-500/30">
                        <div className="text-yellow-400 text-xs font-medium uppercase tracking-wide text-nowrap">
                          In Progress
                        </div>
                        <div className="text-xl font-bold text-yellow-400 mt-1">
                          {selectedTechnicianDetails.serviceTickets.in_progress}
                        </div>
                      </div>
                      <div className="bg-green-500/20 rounded-xl p-3 border border-green-500/30">
                        <div className="text-green-400 text-xs font-medium uppercase tracking-wide">
                          Closed
                        </div>
                        <div className="text-xl font-bold text-green-400 mt-1">
                          {selectedTechnicianDetails.serviceTickets.closed}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Ratings */}

                  {/* Service Requests & Feedbacks Tabs */}
                  <div className="space-y-3">
                    {/* Tab Navigation */}
                    <div className="flex border-b border-white/10">
                      <button
                        onClick={() => setActiveTab("requests")}
                        className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                          activeTab === "requests"
                            ? "text-white border-blue-400"
                            : "text-gray-400 border-transparent hover:text-white"
                        }`}
                      >
                        Service Requests (
                        {selectedTechnicianDetails.serviceTickets.tickets
                          ?.length || 0}
                        )
                      </button>
                      <button
                        onClick={() => setActiveTab("feedbacks")}
                        className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                          activeTab === "feedbacks"
                            ? "text-white border-yellow-400"
                            : "text-gray-400 border-transparent hover:text-white"
                        }`}
                      >
                        Feedbacks (
                        {selectedTechnicianDetails.ratings.feedbacks?.length ||
                          0}
                        )
                      </button>
                    </div>

                    {/* Tab Content */}
                    <div className="max-h-64 overflow-y-auto apple-scrollbar">
                      {activeTab === "requests" ? (
                        <div className="space-y-3">
                          {selectedTechnicianDetails.serviceTickets.tickets
                            ?.length > 0 ? (
                            selectedTechnicianDetails.serviceTickets.tickets.map(
                              (ticket: any, index: number) => (
                                <div
                                  key={index}
                                  className="bg-white/5 rounded-lg p-3 border-l-4 border-blue-400"
                                >
                                  <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                      <h6 className="text-white text-sm font-medium">
                                        {ticket.title || `${ticket.number}`}
                                      </h6>
                                      <p className="text-gray-400 text-xs mt-1">
                                        {ticket.description ||
                                          "No description available"}
                                      </p>
                                      <div className="flex items-center justify-between gap-2 mt-2">
                                        <span
                                          className={`px-2 py-1 rounded-full text-xs font-medium ${
                                            ticket.state === "NEW"
                                              ? "bg-blue-500/20 text-blue-400"
                                              : ticket.state === "IN_PROGRESS"
                                              ? "bg-yellow-500/20 text-yellow-400"
                                              : ticket.state === "CLOSED"
                                              ? "bg-green-500/20 text-green-400"
                                              : "bg-gray-500/20 text-gray-400"
                                          }`}
                                        >
                                          {ticket.state?.replace("_", " ") ||
                                            "Unknown"}
                                        </span>
                                        <span className="text-gray-500 text-center text-xs text-ellipsis w-32 overflow-hidden text-nowrap">
                                          {ticket?.contact?.name}
                                        </span>
                                        <span className="text-gray-500 text-xs">
                                          {moment(ticket.created_at).format(
                                            "MMM DD, YYYY"
                                          )}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              )
                            )
                          ) : (
                            <div className="text-center py-8 text-gray-400">
                              <Ticket className="w-8 h-8 mx-auto mb-2 opacity-50" />
                              <p className="text-sm">
                                No service requests found
                              </p>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {selectedTechnicianDetails.ratings.feedbacks?.length >
                          0 ? (
                            selectedTechnicianDetails.ratings.feedbacks.map(
                              (feedback: any, index: number) => (
                                <div
                                  key={index}
                                  className="bg-white/5 rounded-lg p-3 border-l-4 border-yellow-400"
                                >
                                  <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                      <div className="flex items-center gap-2 mb-2">
                                        <div className="flex items-center gap-1">
                                          {[1, 2, 3, 4, 5].map((star) => (
                                            <Star
                                              key={star}
                                              className={`w-3 h-3 ${
                                                star <= feedback.rating
                                                  ? "text-yellow-400 fill-current"
                                                  : "text-gray-500"
                                              }`}
                                            />
                                          ))}
                                        </div>
                                        <span className="text-yellow-400 text-sm font-medium">
                                          {feedback.rating}/5
                                        </span>
                                      </div>
                                      <p className="text-gray-300 text-sm">
                                        {feedback.comment ||
                                          feedback.feedback ||
                                          "No comment provided"}
                                      </p>
                                      <div className="flex items-center gap-2 mt-2">
                                        <span className="text-gray-500 text-xs">
                                          {feedback.customer_name ||
                                            "Anonymous"}
                                        </span>
                                        <span className="text-gray-500 text-xs">
                                          •
                                        </span>
                                        <span className="text-gray-500 text-xs">
                                          {moment(feedback.created_at).format(
                                            "MMM DD, YYYY"
                                          )}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              )
                            )
                          ) : (
                            <div className="text-center py-8 text-gray-400">
                              <Star className="w-8 h-8 mx-auto mb-2 opacity-50" />
                              <p className="text-sm">No feedback available</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Location Tracking */}
                  <div className="space-y-3">
                    <h4 className="text-white font-medium flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      Location Tracking
                    </h4>

                    {/* Current Location */}
                    <div className="bg-white/5 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-medium text-white">
                          Current Location
                        </span>
                        <span className="text-xs text-gray-400">
                          {
                            selectedTechnicianDetails.locationTracking
                              .totalLocations
                          }{" "}
                          total locations tracked
                        </span>
                      </div>
                      {selectedTechnicianDetails.locationTracking
                        .currentLocation ? (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                            <span className="text-sm text-green-400">
                              Currently active
                            </span>
                          </div>
                          <div className="text-xs text-gray-400">
                            Last updated:{" "}
                            {moment(
                              selectedTechnicianDetails.locationTracking
                                .currentLocation.created_at
                            ).fromNow()}
                          </div>
                          <div className="text-xs text-gray-500">
                            Coordinates:{" "}
                            {selectedTechnicianDetails.locationTracking.currentLocation.latitude?.toFixed(
                              6
                            )}
                            ,{" "}
                            {selectedTechnicianDetails.locationTracking.currentLocation.longitude?.toFixed(
                              6
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 bg-red-400 rounded-full"></div>
                          <span className="text-sm text-red-400">
                            No current location
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Movement Path Animation */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-white">
                          Movement Path (Last 8 Hours)
                        </span>
                        <span className="text-xs text-gray-400">
                          {selectedTechnicianDetails.locationTracking.last8Hours
                            ?.length || 0}{" "}
                          waypoints
                        </span>
                      </div>

                      <div className="bg-white/5 rounded-xl p-4">
                        {selectedTechnicianDetails.locationTracking.last8Hours
                          ?.length > 0 ? (
                          <div className="space-y-3">
                            <div className="flex items-center gap-2">
                              <MapPin className="w-4 h-4 text-blue-400" />
                              <span className="text-sm text-gray-300">
                                Path from{" "}
                                {moment(
                                  selectedTechnicianDetails.locationTracking
                                    .last8Hours[
                                    selectedTechnicianDetails.locationTracking
                                      .last8Hours.length - 1
                                  ].created_at
                                ).format("HH:mm")}{" "}
                                to{" "}
                                {moment(
                                  selectedTechnicianDetails.locationTracking
                                    .last8Hours[0].created_at
                                ).format("HH:mm")}
                              </span>
                            </div>

                            {/* Animation Controls */}
                            <div className="space-y-3">
                              {/* Play Controls */}
                              <div className="flex items-center gap-2">
                                {!isPathPlaying ? (
                                  <button
                                    onClick={() => {
                                      if (!isAnimatingPath) {
                                        setIsAnimatingPath(true);
                                      }
                                      startPathAnimation();
                                    }}
                                    className="flex items-center gap-2 px-3 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded-lg transition-colors text-sm"
                                  >
                                    <Play className="w-4 h-4" />
                                    {isAnimatingPath ? "Resume" : "Play"}
                                  </button>
                                ) : (
                                  <button
                                    onClick={pausePathAnimation}
                                    className="flex items-center gap-2 px-3 py-2 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 rounded-lg transition-colors text-sm"
                                  >
                                    <Pause className="w-4 h-4" />
                                    Pause
                                  </button>
                                )}

                                <button
                                  onClick={resetPathAnimation}
                                  className="flex items-center gap-2 px-3 py-2 bg-gray-500/20 hover:bg-gray-500/30 text-gray-400 rounded-lg transition-colors text-sm"
                                >
                                  <RotateCcw className="w-4 h-4" />
                                  Reset
                                </button>
                              </div>

                              {/* Timeline Display */}
                              {isAnimatingPath && (
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="text-gray-400">
                                      {moment(
                                        selectedTechnicianDetails
                                          .locationTracking.last8Hours[
                                          selectedTechnicianDetails
                                            .locationTracking.last8Hours
                                            .length - 1
                                        ]?.created_at
                                      ).format("HH:mm:ss")}
                                    </span>
                                    <span className="text-white font-medium">
                                      {moment(
                                        selectedTechnicianDetails
                                          .locationTracking.last8Hours[
                                          selectedTechnicianDetails
                                            .locationTracking.last8Hours
                                            .length -
                                            1 -
                                            animationIndex
                                        ]?.created_at
                                      ).format("HH:mm:ss")}
                                    </span>
                                    <span className="text-gray-400">
                                      {moment(
                                        selectedTechnicianDetails
                                          .locationTracking.last8Hours[0]
                                          ?.created_at
                                      ).format("HH:mm:ss")}
                                    </span>
                                  </div>

                                  {/* Progress Slider */}
                                  <div className="relative">
                                    <input
                                      type="range"
                                      min={0}
                                      max={
                                        selectedTechnicianDetails
                                          .locationTracking.last8Hours.length -
                                        1
                                      }
                                      value={animationIndex}
                                      onChange={(e) =>
                                        handleTimelineSeek(
                                          parseInt(e.target.value)
                                        )
                                      }
                                      className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer slider"
                                      style={{
                                        background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${
                                          (animationIndex /
                                            (selectedTechnicianDetails
                                              .locationTracking.last8Hours
                                              .length -
                                              1)) *
                                          100
                                        }%, #4b5563 ${
                                          (animationIndex /
                                            (selectedTechnicianDetails
                                              .locationTracking.last8Hours
                                              .length -
                                              1)) *
                                          100
                                        }%, #4b5563 100%)`,
                                      }}
                                    />
                                  </div>

                                  {/* Timeline Info */}
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="text-blue-400">
                                      Waypoint {animationIndex + 1} of{" "}
                                      {
                                        selectedTechnicianDetails
                                          .locationTracking.last8Hours.length
                                      }
                                    </span>
                                    <span className="text-gray-400">
                                      Duration:{" "}
                                      {moment
                                        .duration(
                                          moment(
                                            selectedTechnicianDetails
                                              .locationTracking.last8Hours[0]
                                              ?.created_at
                                          ).diff(
                                            moment(
                                              selectedTechnicianDetails
                                                .locationTracking.last8Hours[
                                                selectedTechnicianDetails
                                                  .locationTracking.last8Hours
                                                  .length - 1
                                              ]?.created_at
                                            )
                                          )
                                        )
                                        .humanize()}
                                    </span>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="text-center py-4 text-gray-400">
                            <MapPin className="w-6 h-6 mx-auto mb-1 opacity-50" />
                            <p className="text-xs">
                              No movement data available
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center py-12">
                  <div className="text-gray-400 text-center">
                    <User className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>Failed to load technician details</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
