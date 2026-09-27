"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import axiosInterceptorInstance from "@/lib/axios-interceptor";
import { AdminAuth } from "@/lib/admin-auth";
import React from "react";
import { useRouter } from "next/navigation";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import Image from "next/image";

type Props = {};

export default function Reports({}: Props) {
  const router = useRouter();

  React.useEffect(() => {
    if (!AdminAuth.getToken()) {
      router.push("/auth/login");
      return;
    }
    if (!AdminAuth.canAccessReports()) {
      router.replace("/");
    }
  }, [router]);

  const downloadAgingCsv = () => {
    if (!selectedTeam || !selectedQueue) {
      return;
    }
    const url = `/reports/tickets/aging/export?team=${encodeURIComponent(selectedTeam)}&queue=${encodeURIComponent(selectedQueue)}`;
    axiosInterceptorInstance
      .get(url, { responseType: "blob" })
      .then((res) => {
        const blob = new Blob([res.data], { type: "text/csv" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `ticket-aging-${selectedTeam}-${selectedQueue}.csv`;
        link.click();
      })
      .catch(console.error);
  };

  const downloadTeamCsv = () => {
    axiosInterceptorInstance
      .get("/reports/tickets/team/export", { responseType: "blob" })
      .then((res) => {
        const blob = new Blob([res.data], { type: "text/csv" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = "tickets-by-team.csv";
        link.click();
      })
      .catch(console.error);
  };

  const [teams, setTeams] = React.useState<
    | {
        value: string;
        name: string;
      }[]
    | []
  >([]);
  const [queues, setQueues] = React.useState<
    | {
        value: string;
        name: string;
      }[]
    | []
  >([]);
  const [selectedTeam, setSelectedTeam] = React.useState("");
  const [selectedQueue, setSelectedQueue] = React.useState("");
  const [agingReport, setAgingReport] = React.useState<Record<string, number>>(
    {}
  );
  const [agingReportFetching, setAgingReportFetching] = React.useState(false);
  const [ticketReport, setTicketReport] = React.useState([]);
  const [ticketReportFetching, setTicketReportFetching] = React.useState(true);

  function getTeams() {
    axiosInterceptorInstance
      .get("/reports/teams")
      .then((response) => {
        let teams = response.data?.content.map(
          (team: { id: any; name: any }) => {
            return {
              value: team.id,
              name: team.name,
            };
          }
        );
        setTeams(teams);
      })
      .catch((error) => {
        console.error(error);
      });
  }

  function getQueues() {
    axiosInterceptorInstance
      .get("/reports/queues")
      .then((response) => {
        // change
        let queues = response.data?.content.map(
          (queue: { id: any; name: any }) => {
            return {
              value: queue.id,
              name: queue.name,
            };
          }
        );
        console.log(queues);
        setQueues(queues);
      })
      .catch((error) => {
        console.error(error);
      });
  }

  function getTicketReport() {
    setTicketReportFetching(true);
    axiosInterceptorInstance
      .get("/reports/tickets/team")
      .then((response) => {
        console.log(response.data);
        setTicketReport(response.data);
        setTicketReportFetching(false);
      })
      .catch((error) => {
        console.error(error);
      })
      .finally(() => {
        setTicketReportFetching(false);
        console.log("Done");
      });
  }

  function getAgingReport() {
    setAgingReportFetching(true);
    axiosInterceptorInstance
      .get(
        "/reports/tickets/aging?team=" +
          selectedTeam +
          "&queue=" +
          selectedQueue
      )
      .then((response) => {
        setAgingReport(response.data?.[0] ?? {});
        setAgingReportFetching(false);
      })
      .catch((error) => {
        console.error(error);
      })
      .finally(() => {
        setAgingReportFetching(false);
        console.log("Done");
      });
  }

  React.useEffect(() => {
    getTeams();
    getQueues();
    getTicketReport();
  }, []);

  // Group ticket report by owner_team
  const groupedByOwnerTeam = ticketReport.reduce((acc: any, team: any) => {
    if (!acc[team.owner_team]) {
      acc[team.owner_team] = [];
    }
    acc[team.owner_team].push(team);
    return acc;
  }, {});

  return (
    <div className="w-screen overflow-y-scroll p-4 bg-white h-screen space-y-5  gap-5">
      <Button
        className="absolute top-4 left-4 z-50"
        onClick={() => {
          window.location.href = "/";
        }}
      >
        Back
      </Button>
      <div
        className="flex justify-center space-x-2 items-center"
        style={{ marginBottom: "1rem" }}
      >
        <h1 className="text-2xl font-bold">Reports</h1>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Ticket Aging</CardTitle>
          <div className="grid grid-cols-1 md:grid-cols-3  gap-4 py-4 items-center w-full justify-between">
            <select
              defaultValue={"Select Queue"}
              onChange={(e) => setSelectedQueue(e.target.value)}
              className="p-2 border border-gray-300 rounded-md"
            >
              {queues.map((queue) => {
                return (
                  <option key={queue.value} value={queue.value}>
                    {queue.name}
                  </option>
                );
              })}
            </select>

            <select
              defaultValue={"Select Team"}
              onChange={(e) => setSelectedTeam(e.target.value)}
              className="p-2 border border-gray-300 rounded-md"
            >
              {teams.map((team) => {
                return (
                  <option key={team.value} value={team.value}>
                    {team.name}
                  </option>
                );
              })}
            </select>
            <Button
              disabled={agingReportFetching}
              onClick={() => {
                getAgingReport();
              }}
            >
              {agingReportFetching ? "Fetching...." : "Get Report"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!selectedTeam || !selectedQueue}
              onClick={downloadAgingCsv}
            >
              Download CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {agingReportFetching ? (
            <div className="text-center">Fetching...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Age Range</TableHead>
                  <TableHead>Ticket Count</TableHead>
                  <TableHead>Percentage</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                <TableRow>
                  <TableCell>0-1 Days</TableCell>
                  <TableCell>{agingReport["0-1Days"]}</TableCell>
                  <TableCell>
                    {agingReport["0-1DaysPercentage"]?.toFixed(1)} %
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>1-3 Days</TableCell>
                  <TableCell>{agingReport["1-3Days"]}</TableCell>
                  <TableCell>
                    {agingReport["1-3DaysPercentage"]?.toFixed(1)}%
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>3-7 Days</TableCell>
                  <TableCell>{agingReport["3-7Days"]}</TableCell>
                  <TableCell>
                    {agingReport["3-7DaysPercentage"]?.toFixed(1)} %
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>7+ Days</TableCell>
                  <TableCell>{agingReport["7+Days"]}</TableCell>
                  <TableCell>
                    {agingReport["7+DaysPercentage"]?.toFixed(1)} %
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}

          <div className="mt-4 text-sm font-bold">
            Total Tickets: {agingReport?.totalTickets || "Loading..."}
          </div>
        </CardContent>
      </Card>

      <Card className="col-span-2">
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <CardTitle>Details Service Request Report</CardTitle>
            <Button type="button" variant="outline" onClick={downloadTeamCsv}>
              Download CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {Object.entries(groupedByOwnerTeam).map(([ownerTeam, teams]) => (
            <div className="pt-3" key={ownerTeam}>
              <h3 className="text-sm font-semibold py-3">{ownerTeam}</h3>

              <Table className="border-t">
                <TableHeader>
                  <TableRow>
                    <TableHead>Stage</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Closed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {/* @ts-ignore */}
                  {teams.map((team: any) =>
                    Object.entries(team.stages).map(([stage, data]) => (
                      <TableRow key={`${team.owner_team}-${stage}`}>
                        <TableCell>{stage}</TableCell>
                        {/* @ts-ignore */}
                        <TableCell>{data.total}</TableCell>
                        {/* @ts-ignore */}
                        <TableCell>{data.closed_total}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
