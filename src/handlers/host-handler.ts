import { Collection, MongoAtlasDatabase } from '@frankmerema/abstract-database';
import { Observable, throwError } from 'rxjs';
import { hbAxios } from '../helpers/axios-observable';
import { HostDto, HostModel, HostSchema, HostStatus } from '../model';

const config = require('../../service.config.json');

export class HostHandler {

    private hostCollection: Collection<HostModel>;

    constructor() {
        // const connection = new Database('localhost', 27017,
        //     config.database.name, config.database.config).getConnection();

        const connection = new MongoAtlasDatabase(config.database.username, config.database.password,
            config.database.host, config.database.name, config.database.config).getConnection();

        this.hostCollection = new Collection<HostModel>(connection, 'host', HostSchema, 'hosts');

        this.hostCollection.find({})
            .subscribe(hosts => {
                hosts.forEach(host => {
                    hbAxios.get(`http://${host.ip}:${host.port}/api/status`)
                        .subscribe(() => {
                            this.updateHostStatus(host.ip, 'online').subscribe();
                        }, () => {
                            this.updateHostStatus(host.ip, 'offline').subscribe();
                            console.error(`${host.hostName} didn't respond so set to 'offline'`);
                        });
                });
            });
    }

    getHost(id: string): Observable<HostModel> {
        return this.hostCollection.aggregateOne({_id: id}, HostDto);
    }

    getHostStatus(id: string): Observable<HostModel> {
        return this.hostCollection.findOne({_id: id}, {status: true});
    }

    getAllHosts(): Observable<Array<HostModel>> {
        return this.hostCollection.aggregate({}, HostDto);
    }

    addHost(hostName: string, name: string, ip: string, port: number): Observable<HostModel> {
        if (!hostName || !name || !ip || !port) {
            return throwError('Should set hostName, name, ip and port!');
        }

        const newHost = <HostModel>{hostName: hostName, name: name, ip: ip, port: port, status: 'online'};
        console.info(`New host added: ${newHost.name}`);

        return this.hostCollection.findOneAndUpdate({ip: ip}, newHost, {upsert: true, new: true});
    }

    removeHost(id: string): Observable<HostModel> {
        console.info(`Removing host with ip: ${id}`);
        return this.hostCollection.findOneAndRemove({_id: id});
    }

    updateHostStatus(ip: string, status: HostStatus): Observable<HostModel> {
        return this.hostCollection.findOneAndUpdate({ip: ip}, {status: status});
    }
}
